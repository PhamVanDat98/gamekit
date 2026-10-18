// gamekit unity scan — read a Unity project's source (not a build) and write what the port needs:
// project settings, scenes, every script with its serialized fields and JS pitfalls, the values the
// Inspector actually holds (which often differ from the C# defaults), animators, sprites, and a port map.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { fileURLToPath } from 'node:url';
import { exists, readJson, readYaml, readYamlDoc, walk, writeJson, writeYaml, writeYamlDoc } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame, updateGame, nowIso } from './lib/game.mjs';
import { check } from './lib/schema.mjs';
import { isCurve, isUnityText, monoFields, parseUnityYaml, plainValue, refOf } from './lib/unity-yaml.mjs';
import { classKind, scanCsharp } from './lib/csharp.mjs';

export const PORT_MAP_FILE = 'spec/port-map.yaml';
const PITFALLS_DOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'engine-unity', 'references', 'pitfalls.md');
export const UNITY_NOTES = 'notes/unity';

const MAX_FILE = 64 * 1024 * 1024;
const SERIALIZED_EXT = /\.(unity|prefab|asset|controller|anim|overrideController)$/i;
const TEXTURE_EXT = /\.(png|jpe?g|psd|tga|tiff?|bmp|gif|exr)$/i;
const AUDIO_EXT = /\.(wav|mp3|ogg|aiff?|flac)$/i;
const EDITOR_PATH = /(^|\/)Editor\//;
const THIRD_PARTY = /(^|\/)(Plugins|TextMesh ?Pro|Demigiant|DOTween\w*|Spine\w*|Standard Assets|Third ?Party|External|Vendor|Asset ?Store\w*|GoogleMobileAds|Firebase|FacebookSDK|AppsFlyer|IronSource|MaxSdk|Unity-Logs-Viewer|LeanTween|Lean|NiceVibrations|MoreMountains|Feel|Sirenix|Odin\w*|Photon\w*|Mirror|CW|JMO Assets|Polyperfect|Sample ?Scenes?)\//i;

/** Built-in components and the settings that change gameplay or layout. */
const BUILTIN_KEYS = {
  Rigidbody2D: ['m_BodyType', 'm_Simulated', 'm_Mass', 'm_LinearDrag', 'm_LinearDamping', 'm_AngularDrag', 'm_AngularDamping', 'm_GravityScale', 'm_Interpolate', 'm_CollisionDetection', 'm_Constraints'],
  Rigidbody: ['m_Mass', 'm_Drag', 'm_AngularDrag', 'm_UseGravity', 'm_IsKinematic', 'm_Constraints', 'm_CollisionDetection'],
  BoxCollider2D: ['m_IsTrigger', 'm_Offset', 'm_Size', 'm_EdgeRadius', 'm_UsedByComposite'],
  CircleCollider2D: ['m_IsTrigger', 'm_Offset', 'm_Radius'],
  CapsuleCollider2D: ['m_IsTrigger', 'm_Offset', 'm_Size', 'm_Direction'],
  PolygonCollider2D: ['m_IsTrigger', 'm_Offset', 'm_Points'],
  EdgeCollider2D: ['m_IsTrigger', 'm_Offset', 'm_Points', 'm_EdgeRadius'],
  BoxCollider: ['m_IsTrigger', 'm_Center', 'm_Size'],
  SphereCollider: ['m_IsTrigger', 'm_Center', 'm_Radius'],
  CapsuleCollider: ['m_IsTrigger', 'm_Center', 'm_Radius', 'm_Height', 'm_Direction'],
  Camera: ['orthographic', 'orthographic size', 'field of view', 'm_BackGroundColor', 'near clip plane', 'far clip plane'],
  SpriteRenderer: ['m_Sprite', 'm_Color', 'm_FlipX', 'm_FlipY', 'm_SortingLayer', 'm_SortingOrder', 'm_DrawMode', 'm_Size', 'm_Enabled'],
  AudioSource: ['m_audioClip', 'm_Volume', 'm_Pitch', 'Loop', 'm_PlayOnAwake', 'Mute'],
  Animator: ['m_Controller', 'm_UpdateMode', 'm_ApplyRootMotion', 'm_CullingMode'],
  Transform: ['m_LocalPosition', 'm_LocalEulerAnglesHint', 'm_LocalScale'],
  RectTransform: ['m_AnchorMin', 'm_AnchorMax', 'm_AnchoredPosition', 'm_SizeDelta', 'm_Pivot', 'm_LocalScale'],
  Canvas: ['m_RenderMode', 'm_SortingOrder'],
  ParticleSystem: ['lengthInSec', 'looping', 'simulationSpeed'],
};

const rel = (base, p) => path.relative(base, p).split(path.sep).join('/');
const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v);

/** 'project' (has Assets/ and ProjectSettings/), 'build' (a player build or APK), or null. */
export function detectUnity(dir) {
  if (!exists(dir)) return null;
  if (fs.statSync(dir).isFile()) return /\.(apk|aab|ipa|zip)$/i.test(dir) ? 'build' : null;
  if (exists(path.join(dir, 'Assets')) && exists(path.join(dir, 'ProjectSettings'))) return 'project';
  const names = fs.readdirSync(dir);
  if (names.some((n) => /_Data$/.test(n)) || exists(path.join(dir, 'Build')) || names.some((n) => /\.(apk|wasm)$/i.test(n))) return 'build';
  return null;
}

function readSettingsDoc(src, name) {
  const f = path.join(src, 'ProjectSettings', name);
  if (!exists(f)) return null;
  const buf = fs.readFileSync(f);
  if (!isUnityText(buf)) return { binary: true };
  return parseUnityYaml(buf.toString('utf8'))[0]?.body ?? null;
}

function projectSettings(src, warnings) {
  const out = {};
  const ver = path.join(src, 'ProjectSettings', 'ProjectVersion.txt');
  if (exists(ver)) out.unityVersion = fs.readFileSync(ver, 'utf8').match(/m_EditorVersion:\s*(\S+)/)?.[1] ?? null;
  const time = readSettingsDoc(src, 'TimeManager.asset');
  if (time && !time.binary) {
    // Unity 2022+ stores it as ticks of 1/141120000 s; older versions as seconds.
    const ft = time['Fixed Timestep'];
    out.fixedTimestep = ft?.m_Count != null ? Number((ft.m_Count / 141120000).toPrecision(6)) : num(ft);
    out.maximumAllowedTimestep = num(time['Maximum Allowed Timestep']);
    out.timeScale = num(time.m_TimeScale);
  }
  const p2 = readSettingsDoc(src, 'Physics2DSettings.asset');
  if (p2 && !p2.binary) {
    out.gravity2D = p2.m_Gravity ?? null;
    out.physics2D = { velocityIterations: p2.m_VelocityIterations, positionIterations: p2.m_PositionIterations, queriesHitTriggers: p2.m_QueriesHitTriggers, simulationMode: p2.m_SimulationMode ?? p2.m_AutoSimulation };
    out.layerCollisionMatrix2D = p2.m_LayerCollisionMatrix ?? null;
  }
  const p3 = readSettingsDoc(src, 'DynamicsManager.asset');
  if (p3 && !p3.binary) out.gravity3D = p3.m_Gravity ?? null;
  const tags = readSettingsDoc(src, 'TagManager.asset');
  if (tags && !tags.binary) {
    out.tags = tags.tags ?? [];
    out.layers = (tags.layers ?? []).map((n, i) => (n ? `${i}:${n}` : null)).filter(Boolean);
    out.sortingLayers = (tags.m_SortingLayers ?? []).map((l) => l.name);
  }
  const input = readSettingsDoc(src, 'InputManager.asset');
  if (input && !input.binary) {
    out.inputAxes = (input.m_Axes ?? []).map((a) => ({
      name: a.m_Name, positive: a.positiveButton || undefined, negative: a.negativeButton || undefined,
      altPositive: a.altPositiveButton || undefined, altNegative: a.altNegativeButton || undefined,
      gravity: num(a.gravity), sensitivity: num(a.sensitivity), dead: num(a.dead), snap: num(a.snap), type: a.type,
    }));
  }
  const ps = readSettingsDoc(src, 'ProjectSettings.asset');
  if (ps && !ps.binary) {
    out.productName = ps.productName ?? null;
    out.companyName = ps.companyName ?? null;
    out.defaultScreen = { width: ps.defaultScreenWidth, height: ps.defaultScreenHeight, webglWidth: ps.defaultScreenWidthWeb, webglHeight: ps.defaultScreenHeightWeb };
    out.orientation = ps.defaultScreenOrientation;
  }
  const ed = readSettingsDoc(src, 'EditorSettings.asset');
  if (ed && !ed.binary) out.serializationMode = ed.m_SerializationMode; // 2 = Force Text
  if (ed?.binary || (out.serializationMode != null && Number(out.serializationMode) !== 2))
    warnings.push('Asset Serialization không phải "Force Text": scene/prefab ở dạng nhị phân nên không đọc được giá trị inspector. Trong Unity: Edit › Project Settings › Editor › Asset Serialization = Force Text, rồi quét lại.');
  const builds = readSettingsDoc(src, 'EditorBuildSettings.asset');
  out.scenes = (builds && !builds.binary ? builds.m_Scenes ?? [] : []).map((s) => ({ path: s.path, enabled: Number(s.enabled) === 1 }));
  const manifest = path.join(src, 'Packages', 'manifest.json');
  if (exists(manifest)) {
    try {
      out.packages = Object.keys(JSON.parse(fs.readFileSync(manifest, 'utf8')).dependencies ?? {}).filter((p) => !p.startsWith('com.unity.modules.'));
    } catch {
      out.packages = [];
    }
  }
  return out;
}

/** guid → asset path, plus sprite names inside textures, from every .meta under Assets/. */
function readMetas(src, files) {
  const guids = new Map();
  const sprites = new Map(); // `${guid}:${fileID}` → name
  const textures = [];
  for (const f of files.filter((x) => x.endsWith('.meta'))) {
    const asset = f.slice(0, -5);
    const text = fs.readFileSync(path.join(src, f), 'utf8');
    const guid = text.match(/^guid:\s*([0-9a-f]{32})/m)?.[1];
    if (!guid) continue;
    guids.set(guid, asset);
    if (!TEXTURE_EXT.test(asset)) continue;
    let meta;
    try {
      meta = YAML.parse(text)?.TextureImporter;
    } catch {
      continue;
    }
    if (!meta) continue;
    const base = path.basename(asset).replace(/\.[^.]+$/, '');
    sprites.set(`${guid}:21300000`, base);
    const sheet = meta.spriteSheet?.sprites ?? [];
    for (const s of sheet) if (s.internalID != null) sprites.set(`${guid}:${s.internalID}`, s.name);
    for (const e of meta.internalIDToNameTable ?? []) {
      const id = e.first && Object.values(e.first)[0];
      if (id != null) sprites.set(`${guid}:${id}`, e.second);
    }
    for (const [id, name] of Object.entries(meta.fileIDToRecycleName ?? {})) sprites.set(`${guid}:${id}`, name);
    textures.push({
      path: asset,
      pixelsPerUnit: num(meta.spritePixelsToUnits),
      spriteMode: meta.spriteMode, // 1 single, 2 multiple
      filterMode: meta.textureSettings?.filterMode ?? meta.filterMode, // 0 point, 1 bilinear
      pivot: meta.spritePivot,
      sprites: sheet.map((s) => ({ name: s.name, rect: s.rect, pivot: s.pivot, border: s.border })),
    });
  }
  return { guids, sprites, textures };
}

/** Name for a reference: asset path (+ sprite name), or the in-file object. */
function refName(ref, ctx) {
  const r = refOf(ref);
  if (!r) return null;
  if (!r.guid) return `#${r.fileID}`;
  const p = ctx.guids.get(r.guid);
  const sprite = ctx.sprites.get(`${r.guid}:${r.fileID}`);
  if (!p) return `guid:${r.guid}`;
  return sprite && !p.endsWith(`/${sprite}.png`) ? `${p}#${sprite}` : p;
}

/** One scene/prefab/asset file → components with GameObject paths, prefab instances and their overrides. */
function readSerialized(file, docs, ctx) {
  const byId = new Map(docs.map((d) => [d.fileId, d]));
  const goName = (id) => byId.get(String(id))?.body?.m_Name ?? null;
  const transformOfGo = new Map();
  for (const d of docs) if ((d.type === 'Transform' || d.type === 'RectTransform') && d.body) transformOfGo.set(String(d.body.m_GameObject?.fileID), d);
  const goPath = (goId) => {
    const parts = [];
    let t = transformOfGo.get(String(goId));
    let guard = 0;
    let id = String(goId);
    while (id && guard++ < 64) {
      parts.unshift(goName(id) ?? `#${id}`);
      const father = t?.body?.m_Father?.fileID;
      if (!father || String(father) === '0') break;
      const ft = byId.get(String(father));
      id = String(ft?.body?.m_GameObject?.fileID ?? '');
      t = ft;
    }
    return parts.join('/');
  };
  const components = [];
  const instances = [];
  for (const d of docs) {
    if (!d.body || d.stripped) continue;
    const goId = String(d.body.m_GameObject?.fileID ?? '0') === '0' ? null : d.body.m_GameObject.fileID;
    const go = goId != null ? byId.get(String(goId))?.body : null;
    const where = goId != null ? goPath(goId) : null;
    const goInfo = go ? { active: Number(go.m_IsActive) !== 0, layer: go.m_Layer, tag: go.m_TagString } : {};
    if (d.type === 'MonoBehaviour') {
      const sref = refOf(d.body.m_Script);
      const scriptPath = sref?.guid ? ctx.guids.get(sref.guid) ?? null : null;
      const fields = monoFields(d.body);
      let cls = scriptPath?.endsWith('.cs') ? path.basename(scriptPath, '.cs') : null;
      if (!cls) cls = 'm_UiScaleMode' in fields ? 'CanvasScaler' : 'm_text' in fields ? 'TextMeshPro' : `script:${sref?.guid?.slice(0, 8) ?? '?'}`;
      const plain = {};
      for (const [k, v] of Object.entries(fields)) {
        const p = refOf(v) ? undefined : plainValue(v);
        if (p !== undefined) plain[k] = p;
        else if (refOf(v)) plain[k] = { ref: refName(v, ctx) };
      }
      components.push({ fileId: d.fileId, type: 'MonoBehaviour', class: cls, script: scriptPath, object: where ?? (d.body.m_Name || path.basename(file).replace(/\.[^.]+$/, '')), enabled: Number(d.body.m_Enabled ?? 1) !== 0, ...goInfo, fields: plain });
    } else if (d.type === 'PrefabInstance') {
      const mods = (d.body.m_Modification?.m_Modifications ?? []).map((m) => ({
        target: refOf(m.target),
        property: m.propertyPath,
        value: m.value === '' && refOf(m.objectReference) ? { ref: refName(m.objectReference, ctx) } : num(m.value),
      }));
      const name = mods.find((m) => m.property === 'm_Name')?.value ?? null;
      instances.push({ fileId: d.fileId, prefab: refName(d.body.m_SourcePrefab, ctx), name, modifications: mods });
    } else if (BUILTIN_KEYS[d.type]) {
      const keep = {};
      for (const k of BUILTIN_KEYS[d.type]) {
        if (!(k in d.body)) continue;
        const v = d.body[k];
        keep[k] = refOf(v) ? refName(v, ctx) : isCurve(v) ? v : plainValue(v) ?? v;
      }
      components.push({ fileId: d.fileId, type: d.type, object: where, ...goInfo, fields: keep });
    }
  }
  return { components, instances };
}

function readAnimator(docs, ctx) {
  const ctrl = docs.find((d) => d.type === 'AnimatorController')?.body;
  if (!ctrl) return null;
  const byId = new Map(docs.map((d) => [d.fileId, d]));
  const states = docs.filter((d) => d.type === 'AnimatorState' && d.body).map((d) => ({
    name: d.body.m_Name,
    speed: num(d.body.m_Speed),
    clip: refName(d.body.m_Motion, ctx),
    transitions: (d.body.m_Transitions ?? []).map((t) => {
      const tb = byId.get(String(t.fileID))?.body ?? {};
      const dst = byId.get(String(tb.m_DstState?.fileID))?.body?.m_Name ?? (tb.m_IsExit ? '(exit)' : null);
      return {
        to: dst,
        conditions: (tb.m_Conditions ?? []).map((c) => `${c.m_ConditionEvent} ${['', 'If', 'IfNot', 'Greater', 'Less', '', 'Equals', 'NotEqual'][c.m_ConditionMode] ?? c.m_ConditionMode} ${c.m_EventTreshold ?? ''}`.trim()),
        hasExitTime: Number(tb.m_HasExitTime) === 1,
        exitTime: num(tb.m_ExitTime),
        duration: num(tb.m_TransitionDuration),
      };
    }),
  }));
  const anyState = docs.filter((d) => d.type === 'AnimatorStateMachine' && d.body).flatMap((d) =>
    (d.body.m_AnyStateTransitions ?? []).map((t) => {
      const tb = byId.get(String(t.fileID))?.body ?? {};
      return { to: byId.get(String(tb.m_DstState?.fileID))?.body?.m_Name ?? null, conditions: (tb.m_Conditions ?? []).map((c) => c.m_ConditionEvent) };
    }),
  );
  const params = (ctrl.m_AnimatorParameters ?? []).map((p) => `${p.m_Name}:${{ 1: 'float', 3: 'int', 4: 'bool', 9: 'trigger' }[p.m_Type] ?? p.m_Type}`);
  return { name: ctrl.m_Name, parameters: params, states, anyState };
}

function readClip(docs) {
  const c = docs.find((d) => d.type === 'AnimationClip')?.body;
  if (!c) return null;
  const s = c.m_AnimationClipSettings ?? {};
  const curves = ['m_PositionCurves', 'm_EulerCurves', 'm_ScaleCurves', 'm_FloatCurves', 'm_PPtrCurves', 'm_RotationCurves'].flatMap((k) =>
    (c[k] ?? []).map((x) => `${x.path || '(gốc)'}:${x.attribute ?? k.replace(/^m_|Curves$/g, '')}`),
  );
  return {
    name: c.m_Name,
    length: num(s.m_StopTime) - num(s.m_StartTime || 0),
    loop: Number(s.m_LoopTime) === 1,
    sampleRate: num(c.m_SampleRate),
    events: (c.m_Events ?? []).map((e) => ({ time: num(e.time), function: e.functionName, data: e.data || e.floatParameter || e.intParameter || undefined })),
    animates: [...new Set(curves)],
  };
}

/** Compare a serialized value with a C# literal default. */
function sameValue(serialized, literal) {
  if (typeof literal === 'boolean') return Number(serialized) === (literal ? 1 : 0);
  if (typeof literal === 'number') return typeof num(serialized) === 'number' && Math.abs(num(serialized) - literal) <= 1e-6 * Math.max(1, Math.abs(literal));
  return String(serialized ?? '') === literal;
}

/** Scan the whole project. Pure read: writes nothing. */
export function scanUnityProject(src) {
  const warnings = [];
  const settings = projectSettings(src, warnings);
  const files = walk(path.join(src, 'Assets')).map((f) => `Assets/${f}`);
  const ctx = readMetas(src, files);

  // Scripts.
  const scripts = [];
  const classIndex = new Map(); // class name → script record
  for (const f of files.filter((x) => x.endsWith('.cs'))) {
    const r = scanCsharp(fs.readFileSync(path.join(src, f), 'utf8'));
    const rec = { path: f, ...r, editor: EDITOR_PATH.test(f), thirdParty: THIRD_PARTY.test(f), usedIn: new Set() };
    scripts.push(rec);
    for (const c of r.classes) if (!classIndex.has(c.name)) classIndex.set(c.name, { script: rec, cls: c });
  }
  const byName = new Map([...classIndex].map(([n, v]) => [n, v.cls]));
  for (const s of scripts) {
    const own = new Set(s.classes.map((c) => c.name));
    const deps = new Set();
    for (const id of s.identifiers) {
      const d = classIndex.get(id)?.script;
      if (d && d !== s && !own.has(id) && !d.editor && !d.thirdParty) deps.add(d.path);
    }
    s.dependsOn = [...deps].sort();
    delete s.identifiers;
  }
  assignTiers(scripts.filter((s) => !s.editor && !s.thirdParty));
  for (const s of scripts) for (const c of s.classes) c.unityKind = classKind(c.name, byName);

  // Serialized files.
  const serialized = {};
  const animators = [];
  const clips = [];
  let binary = 0;
  for (const f of files.filter((x) => SERIALIZED_EXT.test(x))) {
    const abs = path.join(src, f);
    if (fs.statSync(abs).size > MAX_FILE) {
      warnings.push(`${f}: lớn hơn 64 MB, bỏ qua`);
      continue;
    }
    const buf = fs.readFileSync(abs);
    if (!isUnityText(buf)) {
      binary++;
      continue;
    }
    const docs = parseUnityYaml(buf.toString('utf8'));
    if (/\.controller$/i.test(f)) {
      const a = readAnimator(docs, ctx);
      if (a) animators.push({ path: f, ...a });
      continue;
    }
    if (/\.anim$/i.test(f)) {
      const c = readClip(docs);
      if (c) clips.push({ path: f, ...c });
      continue;
    }
    const r = readSerialized(f, docs, ctx);
    if (r.components.length || r.instances.length) serialized[f] = r;
  }
  if (binary) warnings.push(`${binary} file scene/prefab/asset ở dạng nhị phân, không đọc được — bật Force Text rồi quét lại.`);

  // Where each script is used; the values the Inspector really holds.
  const instancesOf = new Map(); // class → [{ where, fields }]
  const compById = new Map(); // `${file}#${fileId}` → component (to resolve prefab-instance overrides)
  for (const [f, r] of Object.entries(serialized)) {
    for (const c of r.components) {
      compById.set(`${f}#${c.fileId}`, c);
      if (c.type !== 'MonoBehaviour') continue;
      const rec = classIndex.get(c.class)?.script;
      if (rec) rec.usedIn.add(f);
      if (!instancesOf.has(c.class)) instancesOf.set(c.class, []);
      instancesOf.get(c.class).push({ where: `${f} › ${c.object ?? '?'}`, file: f, fields: c.fields });
    }
  }
  for (const [f, r] of Object.entries(serialized)) {
    for (const inst of r.instances) {
      const target = new Map();
      for (const m of inst.modifications) {
        if (!m.target?.guid) continue;
        const prefab = ctx.guids.get(m.target.guid);
        const comp = prefab && compById.get(`${prefab}#${m.target.fileID}`);
        if (!comp || comp.type !== 'MonoBehaviour') continue;
        m.class = comp.class;
        if (/[.[]/.test(m.property)) continue; // nested (arrays, structs): listed in serialized.json
        const key = `${comp.class}`;
        if (!target.has(key)) target.set(key, { where: `${f} › ${inst.name ?? inst.prefab} (ghi đè prefab ${prefab})`, file: f, fields: {}, override: true });
        target.get(key).fields[m.property] = m.value;
      }
      for (const [cls, v] of target) {
        if (!instancesOf.has(cls)) instancesOf.set(cls, []);
        instancesOf.get(cls).push(v);
        classIndex.get(cls)?.script.usedIn.add(f);
      }
    }
  }

  const overrides = [];
  const inspectorOnly = [];
  for (const [cls, list] of instancesOf) {
    const c = classIndex.get(cls)?.cls;
    if (!c) continue;
    for (const field of c.fields) {
      const seen = list.filter((i) => field.name in i.fields);
      if (!seen.length) continue;
      if (field.literal === undefined) {
        const scalars = seen.filter((i) => typeof i.fields[field.name] !== 'object');
        if (scalars.length) inspectorOnly.push({ class: cls, field: field.name, code: field.default, values: scalars.map((i) => ({ where: i.where, value: i.fields[field.name] })) });
        continue;
      }
      const diff = seen.filter((i) => typeof i.fields[field.name] !== 'object' && !sameValue(i.fields[field.name], field.literal));
      if (diff.length) overrides.push({ class: cls, field: field.name, code: field.default, script: classIndex.get(cls).script.path, line: field.line, values: diff.map((i) => ({ where: i.where, value: i.fields[field.name] })) });
    }
  }

  return { settings, scripts: scripts.map((s) => ({ ...s, usedIn: [...s.usedIn].sort() })), serialized, animators, clips, textures: ctx.textures, overrides, inspectorOnly, instancesOf, classIndex, audio: files.filter((f) => AUDIO_EXT.test(f)), warnings };
}

/**
 * Port order: tier 1 depends on no other gameplay script, tier n only on tiers < n. Scripts that depend on
 * each other (a cycle) share a tier and should be ported together. Same tier = can be built in parallel.
 */
export function assignTiers(scripts) {
  const byPath = new Map(scripts.map((s) => [s.path, s]));
  // Tarjan: strongly connected components, so cycles collapse into one node.
  let index = 0;
  const idx = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const comp = new Map();
  const comps = [];
  const visit = (v) => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    onStack.add(v);
    for (const w of byPath.get(v).dependsOn.filter((d) => byPath.has(d))) {
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const c = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.set(w, comps.length);
        c.push(w);
      } while (w !== v);
      comps.push(c);
    }
  };
  for (const p of [...byPath.keys()].sort()) if (!idx.has(p)) visit(p);
  // Tarjan emits components dependencies-first, so one pass in order is enough.
  const tierOf = comps.map(() => 1);
  comps.forEach((c, i) => {
    for (const v of c) for (const d of byPath.get(v).dependsOn) if (byPath.has(d) && comp.get(d) !== i) tierOf[i] = Math.max(tierOf[i], tierOf[comp.get(d)] + 1);
  });
  for (const [p, s] of byPath) {
    s.tier = tierOf[comp.get(p)];
    const c = comps[comp.get(p)];
    if (c.length > 1) s.cycleWith = c.filter((x) => x !== p).sort();
  }
}

/** Values from the Inspector in params format, so params/ take the numbers the game really runs with. */
export function paramsDraft(scan) {
  const out = {};
  const label = (where) => where.replace(/^Assets\//, '').replace(/\.(prefab|unity|asset)\b/, '');
  for (const [cls, list] of scan.instancesOf) {
    const c = scan.classIndex.get(cls)?.cls;
    if (!c) continue;
    const literalOf = new Map(c.fields.map((f) => [f.name, f]));
    const sigs = new Set(list.map((i) => JSON.stringify(i.fields)));
    const groups = sigs.size === 1 ? [[cls, list[0], list.length]] : list.map((i) => [`${cls}@${label(i.where)}`, i, 1]);
    for (const [key, inst, count] of groups) {
      for (const [field, value] of Object.entries(inst.fields)) {
        if (value && typeof value === 'object' && 'ref' in value) continue;
        const code = literalOf.get(field);
        out[key] ??= {};
        out[key][field] = {
          value,
          unit: 'TODO',
          source: `${inst.where} › ${cls}.${field}${count > 1 ? ` (${count} chỗ cùng giá trị)` : ''}${code?.default != null ? ` · code mặc định ${code.default}` : ''}`,
          confidence: 'observed',
        };
      }
    }
  }
  return out;
}

const fmt = (v) => (v == null ? '—' : typeof v === 'object' ? '`' + JSON.stringify(v).slice(0, 80) + '`' : `\`${v}\``);
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** Markdown report the agent reads before porting. */
export function renderReport(scan, { src, game }) {
  const s = scan.settings;
  const L = [];
  const hz = s.fixedTimestep ? Math.round(1 / s.fixedTimestep) : null;
  const gameplay = scan.scripts.filter((x) => !x.editor && !x.thirdParty);
  L.push(`# Project Unity: ${s.productName ?? '?'} (Unity ${s.unityVersion ?? '?'})`, '');
  L.push(`> Sinh bởi \`gamekit unity scan\` lúc ${nowIso()} từ \`${src}\`. Đừng sửa tay — sửa project Unity rồi quét lại. Dữ liệu đầy đủ: \`data/serialized.json\`, \`data/scripts.json\`, \`data/animation.json\`, \`data/settings.json\`, \`data/sprites.json\`. Số liệu dạng params: \`params-draft.json\`.`, '');
  L.push('## Đọc trước khi port', '');
  L.push('- **Số liệu lấy từ giá trị serialized (scene/prefab/asset), không từ giá trị mặc định trong code.** Bảng "Inspector ghi đè" bên dưới là những chỗ hai giá trị này khác nhau — đọc code thôi sẽ port sai.');
  L.push('- Core giữ **đơn vị và trục của Unity** (world unit, y hướng lên, góc độ ngược chiều kim đồng hồ); chỉ `view/` đổi sang pixel canvas (`src/view/unity-space.ts`).');
  L.push('- Hàm Unity có ngữ nghĩa khác JS (Mathf.Round, Random.Range, Sign, coroutine…): dùng `src/core/unity/`, không tự viết lại. Mục "Bẫy khi chuyển sang JS" chỉ ra từng dòng.');
  L.push('- Mỗi script trong `spec/port-map.yaml` phải `done` (kèm `target`) hoặc `skip` (kèm `note`) trước cổng P2.', '');

  L.push('## Cài đặt project', '', '| Mục | Giá trị | Ghi chú |', '| --- | --- | --- |');
  const fixedNote = hz && game?.runtime?.fixedStepHz && game.runtime.fixedStepHz !== hz ? `⚠ game.yaml runtime.fixedStepHz = ${game.runtime.fixedStepHz}; FixedUpdate của game gốc chạy ${hz} Hz` : 'FixedUpdate và vật lý chạy theo nhịp này';
  L.push(`| Fixed Timestep | ${s.fixedTimestep ?? '?'} s${hz ? ` (${hz} Hz)` : ''} | ${fixedNote} |`);
  L.push(`| Maximum Allowed Timestep | ${s.maximumAllowedTimestep ?? '?'} s | trần dt khi máy lag |`);
  if (s.timeScale != null && s.timeScale !== 1) L.push(`| Time Scale | ${s.timeScale} | ⚠ khác 1 |`);
  L.push(`| Gravity 2D | ${fmt(s.gravity2D)} | đơn vị/s², nhân với gravityScale của từng Rigidbody2D |`);
  if (s.gravity3D) L.push(`| Gravity 3D | ${fmt(s.gravity3D)} | |`);
  L.push(`| Màn hình mặc định | ${s.defaultScreen?.width ?? '?'}×${s.defaultScreen?.height ?? '?'} (WebGL ${s.defaultScreen?.webglWidth ?? '?'}×${s.defaultScreen?.webglHeight ?? '?'}) | xem thêm CanvasScaler và Camera.orthographicSize trong serialized.json |`);
  if (s.layers?.length) L.push(`| Layer | ${cell(s.layers.join(', '))} | ma trận va chạm 2D: data/settings.json |`);
  if (s.sortingLayers?.length) L.push(`| Sorting layer | ${cell(s.sortingLayers.join(' < '))} | thứ tự vẽ |`);
  if (s.tags?.length) L.push(`| Tag | ${cell(s.tags.join(', '))} | |`);
  L.push('');

  L.push('## Scene trong build', '');
  if (s.scenes?.length) s.scenes.forEach((x, i) => L.push(`${i + 1}. \`${x.path}\`${x.enabled ? '' : ' (tắt)'}`));
  else L.push('Không có (EditorBuildSettings trống hoặc không đọc được).');
  L.push('');

  const cameras = Object.entries(scan.serialized).flatMap(([f, r]) => r.components.filter((c) => c.type === 'Camera').map((c) => ({ f, c })));
  const scalers = Object.entries(scan.serialized).flatMap(([f, r]) => r.components.filter((c) => c.class === 'CanvasScaler').map((c) => ({ f, c })));
  if (cameras.length || scalers.length) {
    L.push('## Camera và UI', '', '| Ở đâu | Thành phần | Giá trị |', '| --- | --- | --- |');
    for (const { f, c } of cameras) L.push(`| ${cell(`${f} › ${c.object}`)} | Camera | orthographic=${c.fields.orthographic}, size=${c.fields['orthographic size']}, fov=${c.fields['field of view']} |`);
    for (const { f, c } of scalers) L.push(`| ${cell(`${f} › ${c.object}`)} | CanvasScaler | mode=${c.fields.m_UiScaleMode}, reference=${fmt(c.fields.m_ReferenceResolution)}, match=${c.fields.m_MatchWidthOrHeight} |`);
    L.push('');
  }

  if (s.packages?.length) {
    L.push('## Package', '', s.packages.map((p) => `\`${p}\``).join(', '), '');
  }
  if (scan.warnings.length) {
    L.push('## Cảnh báo', '');
    for (const w of scan.warnings) L.push(`- ⚠ ${w}`);
    L.push('');
  }

  L.push(`## Inspector ghi đè giá trị trong code (${scan.overrides.length})`, '');
  if (scan.overrides.length) {
    L.push('Game chạy với cột "Giá trị thật", không phải "Code". Dùng giá trị thật cho params/.', '', '| Script.field | Code | Giá trị thật | Ở đâu |', '| --- | --- | --- | --- |');
    for (const o of scan.overrides)
      for (const v of o.values.slice(0, 8)) L.push(`| ${cell(`${o.class}.${o.field}`)} | ${fmt(o.code)} | ${fmt(v.value)} | ${cell(v.where)} |`);
  } else L.push('Không thấy chỗ nào (hoặc scene/prefab chưa ở dạng text).');
  L.push('');
  if (scan.inspectorOnly.length) {
    L.push(`## Giá trị chỉ có trong inspector (${scan.inspectorOnly.length})`, '', 'Code không gán giá trị đầu (hoặc gán bằng biểu thức) — số thật chỉ nằm trong scene/prefab.', '', '| Script.field | Giá trị | Ở đâu |', '| --- | --- | --- |');
    for (const o of scan.inspectorOnly) for (const v of o.values.slice(0, 4)) L.push(`| ${cell(`${o.class}.${o.field}`)} | ${fmt(v.value)} | ${cell(v.where)} |`);
    L.push('');
  }

  L.push(`## Script (${gameplay.length} gameplay, ${scan.scripts.filter((x) => x.editor).length} editor, ${scan.scripts.filter((x) => x.thirdParty && !x.editor).length} thư viện)`, '');
  L.push('| Script | Class (loại) | Unity message | Dùng ở | Bẫy |', '| --- | --- | --- | --- | --- |');
  for (const x of gameplay) {
    const cls = x.classes.map((c) => `${c.name} (${c.unityKind})`).join(', ') || '—';
    const pit = x.pitfalls.map((p) => `${p.id} L${p.lines.slice(0, 4).join(',')}${p.lines.length > 4 ? '…' : ''}`).join('; ') || '—';
    L.push(`| ${cell(x.path)} | ${cell(cls)} | ${cell(x.messages.join(', ') || '—')} | ${x.usedIn.length} | ${cell(pit)} |`);
  }
  L.push('');

  const tiers = new Map();
  for (const x of gameplay) {
    if (!tiers.has(x.tier)) tiers.set(x.tier, []);
    tiers.get(x.tier).push(x);
  }
  if (tiers.size) {
    L.push('## Thứ tự port', '', 'Tầng 1 không phụ thuộc script gameplay nào khác; tầng n chỉ dùng các tầng trước. Cùng tầng làm song song được (một đợt `fanout`). Script phụ thuộc vòng nằm cùng tầng — port cùng nhau.', '');
    for (const t of [...tiers.keys()].sort((a, b) => a - b)) {
      const names = tiers.get(t).map((x) => `\`${path.basename(x.path, '.cs')}\`${x.cycleWith ? ' (vòng)' : ''}`);
      L.push(`${t}. ${names.join(', ')}`);
    }
    L.push('');
  }

  const byPit = new Map();
  for (const x of gameplay) for (const p of x.pitfalls) {
    if (!byPit.has(p.id)) byPit.set(p.id, { msg: p.msg, where: [] });
    byPit.get(p.id).where.push(`${x.path}:${p.lines[0]}`);
  }
  if (byPit.size) {
    L.push('## Bẫy khi chuyển sang JS', '', 'Chi tiết và cách port đúng: skill `engine-unity`, `references/pitfalls.md`.', '');
    for (const [id, v] of byPit) L.push(`- **${id}** — ${v.msg}. Ở: ${v.where.slice(0, 6).map((w) => `\`${w}\``).join(', ')}${v.where.length > 6 ? ` (+${v.where.length - 6})` : ''}`);
    L.push('');
  }

  if (scan.animators.length || scan.clips.length) {
    L.push('## Animation', '');
    for (const a of scan.animators) {
      L.push(`### ${a.name} (\`${a.path}\`)`, '', `Tham số: ${a.parameters.join(', ') || '—'}`, '');
      for (const st of a.states) {
        const tr = st.transitions.map((t) => `→ ${t.to}${t.conditions.length ? ` [${t.conditions.join(' & ')}]` : ''}${t.hasExitTime ? ` exit ${t.exitTime}` : ''} (${t.duration}s)`).join('; ');
        L.push(`- **${st.name}** clip=${st.clip ?? '—'} speed=${st.speed}${tr ? ` · ${tr}` : ''}`);
      }
      for (const t of a.anyState) L.push(`- Any State → ${t.to} [${t.conditions.join(' & ')}]`);
      L.push('');
    }
    const evented = scan.clips.filter((c) => c.events.length);
    if (evented.length) {
      L.push('**Animation event (gọi hàm gameplay theo thời điểm trong clip — dễ bị quên khi port):**', '');
      for (const c of evented) L.push(`- \`${c.path}\` (${c.length}s${c.loop ? ', loop' : ''}): ${c.events.map((e) => `${e.time}s → ${e.function}()`).join(', ')}`);
      L.push('');
    }
  }

  const ppu = [...new Set(scan.textures.map((t) => t.pixelsPerUnit).filter((x) => x != null))];
  if (scan.textures.length) {
    L.push('## Sprite', '', `${scan.textures.length} texture; Pixels Per Unit: ${ppu.join(', ') || '?'}${ppu.length > 1 ? ' ⚠ nhiều giá trị khác nhau — kích thước hiển thị = pixel / PPU của từng texture' : ''}. Rect, pivot, border: \`data/sprites.json\`.`, '');
  }
  if (s.inputAxes?.some((a) => a.gravity || a.sensitivity)) {
    L.push('## Input axes (Input.GetAxis làm mượt theo gravity/sensitivity)', '', '| Axis | Phím | gravity | sensitivity | snap |', '| --- | --- | --- | --- | --- |');
    for (const a of s.inputAxes.filter((x) => x.positive || x.negative)) L.push(`| ${a.name} | ${cell([a.negative, a.positive, a.altNegative, a.altPositive].filter(Boolean).join(' / '))} | ${a.gravity} | ${a.sensitivity} | ${a.snap} |`);
    L.push('');
  }
  return L.join('\n');
}

/** Port map: one entry per script; re-scans keep what the agent already filled in. */
export function mergePortMap(existing, scan, src) {
  const old = new Map((existing?.scripts ?? []).map((e) => [e.script, e]));
  const scripts = scan.scripts.map((x) => {
    const prev = old.get(x.path);
    old.delete(x.path);
    const auto = x.editor ? 'chỉ chạy trong Unity Editor' : x.thirdParty ? 'thư viện bên thứ ba — dùng tương đương JS nếu gameplay cần' : null;
    return {
      script: x.path,
      classes: x.classes.map((c) => c.name),
      kind: [...new Set(x.classes.map((c) => c.unityKind))].join(',') || 'none',
      usedIn: x.usedIn.length,
      pitfalls: x.pitfalls.map((p) => p.id),
      ...(x.tier ? { tier: x.tier, dependsOn: x.dependsOn } : {}),
      status: prev?.status ?? (auto ? 'skip' : 'todo'),
      target: prev?.target ?? [],
      note: prev?.note ?? auto ?? '',
    };
  });
  // Port order: by tier, then path; editor/library scripts (no tier) last.
  scripts.sort((a, b) => (a.tier ?? Infinity) - (b.tier ?? Infinity) || a.script.localeCompare(b.script));
  const gone = [...old.values()];
  return { map: { source: src, scripts: [...scripts, ...gone.map((g) => ({ ...g, note: g.note || 'không còn trong project Unity' }))] }, gone };
}

export function loadPortMap(root) {
  const f = path.join(root, PORT_MAP_FILE);
  return exists(f) ? readYaml(f) : null;
}

/** Params whose source is one of these classes' fields: `path.in.params` → source. */
function paramsOfClasses(root, classes) {
  const out = [];
  for (const f of walk(path.join(root, 'params')).filter((x) => x.endsWith('.json'))) {
    const visit = (node, keys) => {
      if (!node || typeof node !== 'object') return;
      if ('value' in node && 'source' in node) {
        if (classes.some((c) => node.source.includes(`› ${c}.`))) out.push({ file: f, key: keys.join('.'), value: node.value });
        return;
      }
      for (const [k, v] of Object.entries(node)) if (k !== '$schema') visit(v, [...keys, k]);
    };
    try {
      visit(readJson(path.join(root, 'params', f)), []);
    } catch {
      // validate reports broken params files
    }
  }
  return out;
}

/** BRIEF.md section for a module that ports these original scripts: where to read them and what goes wrong. */
export function scriptsBrief(root, game, scripts) {
  const data = path.join(root, UNITY_NOTES, 'data');
  const info = exists(path.join(data, 'scripts.json')) ? new Map(readJson(path.join(data, 'scripts.json')).map((s) => [s.path, s])) : new Map();
  const ov = exists(path.join(data, 'overrides.json')) ? readJson(path.join(data, 'overrides.json')) : { overrides: [], inspectorOnly: [] };
  const src = game.source?.path ? path.resolve(root, game.source.path) : null;
  const L = ['## Script gốc cần port', ''];
  L.push(`Đọc từng script gốc, port theo thứ tự dưới đây (theo tầng phụ thuộc). Logic vào \`src/core/\`, hiển thị vào \`src/view/\`; Mathf, Random.Range, AnimationCurve, coroutine/Invoke dùng \`src/core/unity/\`; toạ độ giữ đơn vị Unity (y lên). Bảng bẫy và cách port đúng: \`${PITFALLS_DOC}\`.`, '');
  const ordered = [...scripts].sort((a, b) => (info.get(a)?.tier ?? 99) - (info.get(b)?.tier ?? 99) || a.localeCompare(b));
  for (const s of ordered) {
    const x = info.get(s);
    L.push(`### ${s}`, '');
    if (src) L.push(`- Mã gốc: \`${path.join(src, s)}\``);
    if (!x) {
      L.push('- (không có trong notes/unity/data/scripts.json — chạy lại `gamekit unity scan`)', '');
      continue;
    }
    const classes = x.classes.map((c) => c.name);
    L.push(`- Class: ${x.classes.map((c) => `${c.name} (${c.unityKind ?? c.kind})`).join(', ') || '—'} · Unity message: ${x.messages.join(', ') || '—'}${x.tier ? ` · tầng ${x.tier}` : ''}`);
    if (x.dependsOn?.length) L.push(`- Dùng tới: ${x.dependsOn.map((d) => `\`${d}\``).join(', ')}${x.cycleWith ? ` (phụ thuộc vòng với ${x.cycleWith.join(', ')} — port cùng nhau)` : ''}`);
    for (const p of x.pitfalls) L.push(`- ⚠ **${p.id}** dòng ${p.lines.join(', ')}: ${p.msg}`);
    const mine = (list) => list.filter((o) => classes.includes(o.class));
    for (const o of mine(ov.overrides)) L.push(`- Inspector ghi đè: \`${o.field}\` code ${o.code} → game chạy ${o.values.map((v) => `${JSON.stringify(v.value)} (${v.where})`).join('; ')}`);
    for (const o of mine(ov.inspectorOnly)) L.push(`- Chỉ có trong inspector: \`${o.field}\` = ${o.values.map((v) => `${JSON.stringify(v.value)} (${v.where})`).join('; ')}`);
    const ps = paramsOfClasses(root, classes);
    if (ps.length) L.push(`- Params sẵn có: ${ps.map((p) => (p.file === 'game.json' ? `\`PARAMS.${p.key}\`` : `\`params/${p.file}:${p.key}\``)).join(', ')}`);
    else if (mine(ov.overrides).length || mine(ov.inspectorOnly).length) L.push('- Chưa có params cho class này: báo agent chính chạy `gamekit unity params <Class>` (params/ là vùng dùng chung).');
    L.push('');
  }
  L.push('Không sửa `spec/port-map.yaml` — integrate tự đánh dấu các script này `done`. Script nào không port (thuần hình ảnh, đã thay bằng thứ khác): ghi lý do trong phần trả lời.', '');
  return L.join('\n');
}

/** After a module merged: its scripts become done, targets = the folders it owns that now exist. */
export function markPortMapDone(root, scripts, owns) {
  const f = path.join(root, PORT_MAP_FILE);
  if (!exists(f) || !scripts?.length) return [];
  const doc = readYamlDoc(f);
  const list = doc.get('scripts');
  const targets = owns.map((o) => o.replace(/\/+$/, '')).filter((o) => exists(path.join(root, o)));
  const changed = [];
  if (!targets.length) return changed;
  for (const item of list?.items ?? []) {
    const s = item.get('script');
    if (!scripts.includes(s) || ['done', 'skip'].includes(item.get('status'))) continue;
    item.set('status', 'done');
    item.set('target', doc.createNode(targets));
    changed.push(s);
  }
  if (changed.length) writeYamlDoc(f, doc);
  return changed;
}

/** Gate check: P1 needs the scan done; from P2 every script is done (with targets) or skipped (with a reason). */
export function portMapStatus(root, { strict }) {
  const game = loadGame(root);
  const f = path.join(root, PORT_MAP_FILE);
  if (!exists(f)) {
    if (game.source?.engine !== 'unity') return { ok: true, detail: '' };
    const src = game.source?.path ? path.resolve(root, game.source.path) : null;
    if (src && detectUnity(src) === 'build') return { ok: true, detail: 'không có project Unity (chỉ có bản build) — bỏ qua' };
    return { ok: false, detail: 'chưa quét: chạy `gamekit unity scan`' };
  }
  let data;
  try {
    data = readYaml(f);
  } catch (e) {
    return { ok: false, detail: e.message };
  }
  const errs = check('port-map', data);
  if (errs.length) return { ok: false, detail: `${PORT_MAP_FILE}: ${errs.slice(0, 3).join('; ')}` };
  if (!strict) return { ok: true, detail: '' };
  const open = [];
  for (const e of data.scripts) {
    if (e.status === 'skip' && !e.note?.trim()) open.push(`${e.script} (skip thiếu note)`);
    else if (e.status === 'done') {
      if (!e.target?.length) open.push(`${e.script} (done thiếu target)`);
      else for (const t of e.target) if (!exists(path.join(root, t))) open.push(`${e.script} (target ${t} không có)`);
    } else if (e.status !== 'skip') open.push(e.script);
  }
  return { ok: open.length === 0, detail: open.length ? `${open.length} script chưa xong: ${open.slice(0, 5).join(', ')}${open.length > 5 ? '…' : ''}` : '' };
}

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const camel = (s) => lowerFirst(s.replace(/\.[a-z]+$/i, '').split(/[^A-Za-z0-9]+/).filter(Boolean).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join(''));
/** `file › object › Class.field (…) · code …` → `file › object › Class.field`, the part that identifies the value. */
export const sourceKey = (src) => String(src ?? '').split(' · ')[0].replace(/ \(\d+ chỗ cùng giá trị\)$/, '').trim();

/** Draft key → params path: `Spawner` → spawner; `PlayerController@Scenes/Main › Player (…)` → playerController.mainPlayer. */
export function draftGroupPath(key) {
  const [cls, label] = key.split('@');
  if (!label) return [lowerFirst(cls)];
  const [file, object = ''] = label.replace(/\s*\(.*\)\s*$/, '').split(' › ');
  const base = file.split('/').pop();
  const last = object.split('/').pop();
  return [lowerFirst(cls), camel(base === last || !last ? base : `${base} ${last}`) || 'instance'];
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * gamekit unity params <Class|Class.field|draft key…> [--all] [--file params/game.json] [--as group.path] [--force] [--check]
 * Copies Inspector values from notes/unity/params-draft.json into params/, keeping source and confidence.
 */
export function importParams(root, selectors, { all, file = 'params/game.json', as, force, check } = {}) {
  const draftFile = path.join(root, UNITY_NOTES, 'params-draft.json');
  if (!exists(draftFile)) throw new GkError('Chưa có notes/unity/params-draft.json — chạy `gamekit unity scan` trước.');
  const draft = JSON.parse(fs.readFileSync(draftFile, 'utf8'));
  delete draft.$comment;
  const target = path.join(root, file);
  const data = exists(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : { $schema: '../.gamekit/schemas/params.schema.json' };
  const out = { added: [], updated: [], same: [], drift: [], noUnit: [], skipped: [] };

  if (check) {
    // Every param that came from the Inspector: is it still what the Unity project holds?
    const latest = new Map();
    for (const group of Object.values(draft)) for (const p of Object.values(group)) latest.set(sourceKey(p.source), p.value);
    for (const f of walk(path.join(root, 'params')).filter((x) => x.endsWith('.json'))) {
      const visit = (node, keys) => {
        if (!node || typeof node !== 'object') return;
        if ('value' in node && 'source' in node) {
          const k = sourceKey(node.source);
          if (latest.has(k) && !same(latest.get(k), node.value) && !node.deviation) out.drift.push({ key: `params/${f}:${keys.join('.')}`, value: node.value, unity: latest.get(k) });
          return;
        }
        for (const [k, v] of Object.entries(node)) if (k !== '$schema') visit(v, [...keys, k]);
      };
      visit(JSON.parse(fs.readFileSync(path.join(root, 'params', f), 'utf8')), []);
    }
    return out;
  }

  const picks = []; // [draftKey, field|null]
  if (all) for (const k of Object.keys(draft)) picks.push([k, null]);
  for (const sel of selectors) {
    if (draft[sel]) {
      picks.push([sel, null]);
      continue;
    }
    const [cls, field] = sel.split(/\.(?=[^.]+$)/);
    const keys = Object.keys(draft).filter((k) => k === sel || k.split('@')[0] === sel);
    const fieldKeys = field ? Object.keys(draft).filter((k) => k.split('@')[0] === cls && field in draft[k]) : [];
    if (keys.length) for (const k of keys) picks.push([k, null]);
    else if (fieldKeys.length) for (const k of fieldKeys) picks.push([k, field]);
    else throw new GkError(`params-draft.json không có "${sel}". Có: ${[...new Set(Object.keys(draft).map((k) => k.split('@')[0]))].join(', ')}`);
  }
  if (as && new Set(picks.map((p) => p[0])).size > 1) throw new GkError('--as chỉ dùng khi chọn đúng một nhóm (một class có một bản, hoặc một khoá draft)');

  for (const [key, only] of picks) {
    const group = as ? String(as).split('.') : draftGroupPath(key);
    let node = data;
    for (const g of group) {
      if (node[g] && typeof node[g] === 'object' && 'value' in node[g]) throw new GkError(`${file}: ${group.join('.')} đã là một giá trị, không phải nhóm`);
      node = node[g] ??= {};
    }
    for (const [field, p] of Object.entries(draft[key])) {
      if (only && field !== only) continue;
      const at = `${group.join('.')}.${field}`;
      if (field === 'value') {
        out.skipped.push(`${at} (tên "value" trùng khoá của params — chép tay với tên khác)`);
        continue;
      }
      const next = { value: p.value, ...(p.unit && p.unit !== 'TODO' ? { unit: p.unit } : {}), source: p.source, confidence: p.confidence ?? 'observed' };
      const cur = node[field];
      if (!cur) {
        node[field] = next;
        out.added.push(at);
      } else if (same(cur.value, next.value)) out.same.push(at);
      else if (force && !cur.deviation) {
        node[field] = { ...cur, value: next.value, source: next.source, confidence: next.confidence };
        out.updated.push(at);
      } else out.drift.push({ key: `${file}:${at}`, value: cur.value, unity: next.value });
      if (!node[field].unit) out.noUnit.push(at);
    }
  }
  if (out.added.length || out.updated.length) writeJson(target, data);
  return out;
}

export async function run(args) {
  const sub = args._[0];
  if (sub === 'params') {
    const root = requireGameRoot(args.cwd);
    const file = String(args.file ?? 'params/game.json');
    if (!args.all && !args.check && args._.length < 2) throw new GkError('Dùng: gamekit unity params <Class | Class.field | khoá trong params-draft.json …> [--all] [--file params/game.json] [--as nhóm] [--force] | --check');
    const r = importParams(root, args._.slice(1).map(String), { all: args.all, file, as: args.as, force: args.force, check: args.check });
    if (args.check) {
      for (const d of r.drift) log.warn(`${d.key} = ${JSON.stringify(d.value)}, project Unity hiện là ${JSON.stringify(d.unity)}`);
      if (r.drift.length) log.fail(`${r.drift.length} giá trị lệch với project Unity (quét lần gần nhất). Cập nhật: gamekit unity params <…> --force, hoặc ghi deviation nếu cố ý khác.`);
      else log.ok('params khớp giá trị inspector của lần quét gần nhất');
      return r.drift.length ? 1 : 0;
    }
    if (r.added.length) log.ok(`Thêm ${r.added.length} giá trị vào ${file}: ${r.added.join(', ')}`);
    if (r.updated.length) log.ok(`Cập nhật ${r.updated.length} giá trị theo project Unity: ${r.updated.join(', ')}`);
    if (r.same.length) log.dim(`${r.same.length} giá trị đã có, giống project Unity`);
    for (const d of r.drift) log.warn(`${d.key} = ${JSON.stringify(d.value)} nhưng project Unity là ${JSON.stringify(d.unity)} — giữ nguyên; --force để lấy giá trị Unity`);
    for (const s of r.skipped) log.warn(`Bỏ qua ${s}`);
    if (r.noUnit.length) log.info(`Còn thiếu unit (world unit, s, độ, unit/s…): ${r.noUnit.join(', ')}`);
    if (file !== 'params/game.json' && r.added.length) log.info(`Nhớ đọc ${file} trong src/core/params.ts (mặc định chỉ đọc params/game.json).`);
    return 0;
  }
  if (sub !== 'scan') throw new GkError('Dùng: gamekit unity scan [--src <thư mục project Unity>] | gamekit unity params <Class…> [--all] [--check]');
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const given = args.src ?? game.source?.path;
  if (!given) throw new GkError('Chưa biết project Unity ở đâu: thêm --src <thư mục project> hoặc điền source.path trong game.yaml.');
  const src = path.resolve(root, String(given));
  const kind = detectUnity(src);
  if (kind === 'build') throw new GkError(`${src} là bản build (APK/WebGL/_Data), không phải project Unity. Quét cần thư mục có Assets/ và ProjectSettings/. Chỉ có bản build: làm theo skill re-notes.`);
  if (kind !== 'project') throw new GkError(`${src} không phải project Unity (cần Assets/ và ProjectSettings/).`);

  log.info(`Quét project Unity ${src}…`);
  const scan = scanUnityProject(src);
  const notes = path.join(root, UNITY_NOTES);
  fs.rmSync(path.join(notes, 'data'), { recursive: true, force: true });
  writeJson(path.join(notes, 'data', 'settings.json'), scan.settings);
  writeJson(path.join(notes, 'data', 'scripts.json'), scan.scripts);
  writeJson(path.join(notes, 'data', 'serialized.json'), scan.serialized);
  writeJson(path.join(notes, 'data', 'animation.json'), { animators: scan.animators, clips: scan.clips });
  writeJson(path.join(notes, 'data', 'overrides.json'), { overrides: scan.overrides, inspectorOnly: scan.inspectorOnly });
  writeJson(path.join(notes, 'data', 'sprites.json'), { textures: scan.textures, audio: scan.audio });
  writeJson(path.join(notes, 'params-draft.json'), { $comment: 'Sinh bởi gamekit unity scan: giá trị inspector theo dạng params. Chép mục cần dùng sang params/*.json, điền unit; đừng sửa file này.', ...paramsDraft(scan) });
  fs.writeFileSync(path.join(notes, 'REPORT.md'), renderReport(scan, { src: String(given), game }) + '\n');

  const mapFile = path.join(root, PORT_MAP_FILE);
  const { map, gone } = mergePortMap(exists(mapFile) ? readYaml(mapFile) : null, scan, String(given));
  writeYaml(mapFile, map);
  fs.writeFileSync(mapFile, `# Sinh bởi gamekit unity scan; quét lại giữ nguyên status/target/note. Mỗi script: todo → done (target = file TS) hoặc skip (note = lý do).\n${fs.readFileSync(mapFile, 'utf8')}`);

  const edits = [];
  if (scan.settings.unityVersion && game.source?.engineVersion !== scan.settings.unityVersion) edits.push([['source', 'engineVersion'], scan.settings.unityVersion]);
  if (!game.source?.path) edits.push([['source', 'path'], String(given)]);
  if (edits.length) updateGame(root, edits);

  const gameplay = scan.scripts.filter((x) => !x.editor && !x.thirdParty);
  log.ok(`Unity ${scan.settings.unityVersion ?? '?'}: ${gameplay.length} script gameplay, ${Object.keys(scan.serialized).length} scene/prefab/asset, ${scan.animators.length} animator`);
  const hz = scan.settings.fixedTimestep ? Math.round(1 / scan.settings.fixedTimestep) : null;
  if (hz && game.runtime?.fixedStepHz !== hz) log.warn(`FixedUpdate của game gốc chạy ${hz} Hz, game.yaml runtime.fixedStepHz = ${game.runtime?.fixedStepHz} — xem skill engine-unity mục nhịp mô phỏng`);
  if (scan.overrides.length) log.warn(`${scan.overrides.length} field có giá trị inspector khác giá trị trong code — params phải lấy giá trị inspector (bảng trong REPORT.md)`);
  for (const w of scan.warnings) log.warn(w);
  for (const g of gone) log.warn(`${g.script}: có trong port-map nhưng không còn trong project`);
  if (exists(path.join(root, 'params'))) {
    const drift = importParams(root, [], { check: true }).drift;
    for (const d of drift) log.warn(`${d.key} = ${JSON.stringify(d.value)}, project Unity giờ là ${JSON.stringify(d.unity)} — gamekit unity params --check`);
  }
  log.info(`Đã ghi ${UNITY_NOTES}/REPORT.md, ${UNITY_NOTES}/params-draft.json, ${UNITY_NOTES}/data/, ${PORT_MAP_FILE}. Đọc REPORT.md trước khi port.`);
  return 0;
}

