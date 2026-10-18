// Unity's text serialization: one file = many YAML documents, each headed `--- !u!<classId> &<fileId>`.
// The custom tags trip a plain YAML parser, so split on the headers and parse each body on its own.
import YAML from 'yaml';

/** Class ids we name in reports. Full list: docs.unity3d.com/Manual/ClassIDReference.html */
export const CLASS_NAMES = {
  1: 'GameObject',
  4: 'Transform',
  20: 'Camera',
  23: 'MeshRenderer',
  50: 'Rigidbody2D',
  54: 'Rigidbody',
  58: 'CircleCollider2D',
  60: 'PolygonCollider2D',
  61: 'BoxCollider2D',
  65: 'BoxCollider',
  66: 'CompositeCollider2D',
  68: 'EdgeCollider2D',
  70: 'CapsuleCollider2D',
  74: 'AnimationClip',
  82: 'AudioSource',
  91: 'AnimatorController',
  95: 'Animator',
  114: 'MonoBehaviour',
  135: 'SphereCollider',
  136: 'CapsuleCollider',
  198: 'ParticleSystem',
  212: 'SpriteRenderer',
  222: 'CanvasRenderer',
  223: 'Canvas',
  224: 'RectTransform',
  225: 'CanvasGroup',
  1001: 'PrefabInstance',
  1101: 'AnimatorStateTransition',
  1102: 'AnimatorState',
  1107: 'AnimatorStateMachine',
  1660057539: 'SceneRoots',
};

const HEADER = /^--- !u!(\d+) &(-?\d+)( stripped)?[^\n]*$/gm;

/** True when the file is Unity text YAML (Asset Serialization = Force Text), not binary. */
export const isUnityText = (buf) => buf.subarray(0, 5).toString('latin1') === '%YAML';

/**
 * Parse a .unity/.prefab/.asset/.controller/.anim text file.
 * Returns [{ classId, fileId, type, stripped, body }]; `body` is null when the document could not be parsed.
 */
export function parseUnityYaml(text) {
  const docs = [];
  const heads = [...text.matchAll(HEADER)];
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i];
    const start = h.index + h[0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index : text.length;
    const chunk = text.slice(start, end);
    const classId = Number(h[1]);
    let type = CLASS_NAMES[classId] ?? `class${classId}`;
    let body = null;
    if (!h[3]) {
      try {
        const parsed = YAML.parse(chunk, { uniqueKeys: false, maxAliasCount: -1 });
        if (parsed && typeof parsed === 'object') {
          const key = Object.keys(parsed)[0];
          type = key ?? type;
          body = parsed[key] ?? {};
        }
      } catch {
        body = null;
      }
    }
    docs.push({ classId, fileId: h[2], type, stripped: Boolean(h[3]), body });
  }
  return docs;
}

/** `{fileID: 0}` / `{fileID: 11500000, guid: …, type: 3}` → a reference, or null for "none". */
export function refOf(v) {
  if (!v || typeof v !== 'object' || !('fileID' in v)) return null;
  if (String(v.fileID) === '0' && !v.guid) return null;
  return { fileID: String(v.fileID), guid: v.guid ?? null };
}

export const isRef = (v) => v != null && typeof v === 'object' && !Array.isArray(v) && 'fileID' in v;

/** Keys Unity writes on every MonoBehaviour; the rest are the script's own serialized fields. */
export const MONO_BUILTIN = new Set([
  'm_ObjectHideFlags',
  'm_CorrespondingSourceObject',
  'm_PrefabInstance',
  'm_PrefabAsset',
  'm_PrefabParentObject',
  'm_PrefabInternal',
  'm_GameObject',
  'm_Enabled',
  'm_EditorHideFlags',
  'm_Script',
  'm_Name',
  'm_EditorClassIdentifier',
]);

/** A MonoBehaviour body without Unity's bookkeeping keys. */
export function monoFields(body) {
  const out = {};
  for (const [k, v] of Object.entries(body ?? {})) if (!MONO_BUILTIN.has(k)) out[k] = v;
  return out;
}

/** Unity serializes AnimationCurve as { serializedVersion, m_Curve: [...], m_PreInfinity, m_PostInfinity, … }. */
export const isCurve = (v) => v != null && typeof v === 'object' && Array.isArray(v.m_Curve) && 'm_PostInfinity' in v;

/** Plain-data values only (numbers, strings, curves, vectors…) — drops object references. */
export function plainValue(v) {
  if (v == null || typeof v !== 'object') return v;
  if (isRef(v)) return undefined;
  if (Array.isArray(v)) {
    const items = v.map(plainValue);
    return items.some((x) => x === undefined) ? undefined : items;
  }
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    const p = plainValue(x);
    if (p !== undefined) out[k] = p;
  }
  return Object.keys(out).length ? out : undefined;
}
