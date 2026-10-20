// Motion files (motion/*.json): sampling, animation-principle checks and a text timing chart.
// The game plays the same files with src/view/anim/ — keep EASES in step with src/view/anim/ease.ts.

const C1 = 1.70158;
const C2 = C1 * 1.525;
const C3 = C1 + 1;
const C4 = (2 * Math.PI) / 3;

function outBounce(t) {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

/** t in 0..1 → progress (may leave 0..1 for back/elastic). */
export const EASES = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inBack: (t) => C3 * t * t * t - C1 * t * t,
  outBack: (t) => 1 + C3 * (t - 1) ** 3 + C1 * (t - 1) ** 2,
  inOutBack: (t) =>
    t < 0.5 ? ((2 * t) ** 2 * ((C2 + 1) * 2 * t - C2)) / 2 : ((2 * t - 2) ** 2 * ((C2 + 1) * (2 * t - 2) + C2) + 2) / 2,
  outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((10 * t - 0.75) * C4) + 1),
  outBounce,
  hold: (t) => (t < 1 ? 0 : 1),
};
export const DEFAULT_EASE = 'inOut';
const OVERSHOOT_EASES = new Set(['outBack', 'inOutBack', 'outElastic', 'outBounce']);

/** Value of one track at frame f (clamped to its first/last key). */
export function sampleKeys(keys, f) {
  if (f <= keys[0].f) return keys[0].v;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (f <= b.f) return a.v + (b.v - a.v) * EASES[b.ease ?? DEFAULT_EASE]((f - a.f) / (b.f - a.f));
  }
  return keys[keys.length - 1].v;
}

export const motionFrames = (m) => m.frames ?? Math.max(...Object.values(m.tracks).map((k) => k[k.length - 1].f));
/** Frames are in m.fps; the checks think in 60fps frames. */
const at60 = (m, frames) => (frames * 60) / (m.fps ?? 60);

const splitTrack = (name) => {
  const i = name.lastIndexOf('.');
  return { part: name.slice(0, i), prop: name.slice(i + 1) };
};
const POSITION = new Set(['x', 'y']);
const DEFORM = new Set(['sx', 'sy', 'stretch']);
// Below these a change is noise, not movement.
const EPS = { x: 0.5, y: 0.5, rot: 0.5, sx: 0.005, sy: 0.005, stretch: 0.005, alpha: 0.005 };
const REST = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, stretch: 1, alpha: 1 };
// Which kind of change counts as "the main action" when no key says beat: action.
const PRIORITY = { x: 3, y: 3, rot: 2, sx: 1, sy: 1, stretch: 1, alpha: 0 };

export function segments(m) {
  const out = [];
  for (const [track, keys] of Object.entries(m.tracks)) {
    const { part, prop } = splitTrack(track);
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1];
      const b = keys[i];
      const dv = b.v - a.v;
      out.push({ track, part, prop, from: a.f, to: b.f, dv, ease: b.ease ?? DEFAULT_EASE, beat: b.beat, moving: Math.abs(dv) > EPS[prop] });
    }
  }
  return out;
}

function structure(m) {
  const errors = [];
  const D = m.frames;
  const parts = {};
  for (const [track, keys] of Object.entries(m.tracks)) {
    const { part, prop } = splitTrack(track);
    (parts[part] ??= new Set()).add(prop);
    for (let i = 1; i < keys.length; i++)
      if (!(keys[i].f > keys[i - 1].f)) errors.push(`${track}: key ${i} (f=${keys[i].f}) phải sau key trước (f=${keys[i - 1].f})`);
    if (D != null && keys[keys.length - 1].f > D) errors.push(`${track}: key f=${keys[keys.length - 1].f} vượt frames=${D}`);
  }
  for (const [part, props] of Object.entries(parts))
    if (props.has('stretch') && (props.has('sx') || props.has('sy'))) errors.push(`${part}: stretch đã điều khiển sx/sy, không dùng chung với ${props.has('sx') ? 'sx' : 'sy'}`);
  return errors;
}

/** The segment that is "the action": a key marked beat: action, else the biggest move of the most telling kind. */
export function mainAction(segs) {
  const marked = segs.find((s) => s.beat === 'action' && s.moving);
  if (marked) return marked;
  const moving = segs.filter((s) => s.moving);
  if (!moving.length) return null;
  const top = Math.max(...moving.map((s) => PRIORITY[s.prop]));
  return moving.filter((s) => PRIORITY[s.prop] === top).reduce((a, b) => (Math.abs(b.dv) > Math.abs(a.dv) ? b : a));
}

const NEEDS_ANTICIPATION = new Set(['action', 'telegraph']);
const NEEDS_FOLLOW = new Set(['action', 'player-action', 'telegraph', 'reaction', 'ui']);
const CHARACTER = new Set(['action', 'player-action', 'telegraph', 'reaction']);
// Limits in 60fps frames.
const PLAYER_ANTICIPATION_MAX = 4; // ~67 ms: longer and the controls feel late
const TELEGRAPH_MIN = 18; // ~300 ms: shorter and the player cannot react
const REACTION_START_MAX = 2; // a hit lands now, not after a wind-up
const UI_MAX = 36; // 0.6 s
const IDLE_MIN = 60;

/**
 * Checks a motion against the animation principles this kit enforces.
 * Returns { errors, warnings, waived, info } — each problem is { check, msg }.
 */
export function analyzeMotion(m) {
  const errors = [];
  const warnings = [];
  for (const msg of structure(m)) errors.push({ check: 'structure', msg });
  if (errors.length) return { errors, warnings, waived: [], info: {} };

  const D = motionFrames(m);
  const segs = segments(m);
  const moving = segs.filter((s) => s.moving);
  const main = mainAction(segs);
  const role = m.role;
  const err = (check, msg) => errors.push({ check, msg });
  const warn = (check, msg) => warnings.push({ check, msg });
  const info = { frames: D, seconds: D / (m.fps ?? 60), main, anticipation: null, followUntil: null };

  // Loops: no pop at the seam.
  if (m.loop) {
    for (const [track, keys] of Object.entries(m.tracks)) {
      const first = keys[0];
      const last = keys[keys.length - 1];
      if (first.f !== 0 || last.f !== D || Math.abs(first.v - last.v) > EPS[splitTrack(track).prop])
        err('structure', `${track}: vòng lặp cần key ở f=0 và f=${D} cùng giá trị (đang ${first.f}:${first.v} → ${last.f}:${last.v}) — không thì giật ở chỗ nối`);
    }
  } else if (role === 'idle') err('structure', 'idle phải là vòng lặp (loop: true)');

  if (!main) {
    if (role !== 'fx') warn('timing', 'không có gì chuyển động');
    return finish(m, errors, warnings, info);
  }

  const lastMove = Math.max(...moving.map((s) => s.to));

  // Slow in / slow out: nothing alive moves at constant speed.
  for (const s of moving) {
    if (s.ease !== 'linear' || role === 'fx') continue;
    const keys = m.tracks[s.track];
    const monotonic = keys.every((k, i) => i === 0 || Math.sign(k.v - keys[i - 1].v) === Math.sign(keys[1].v - keys[0].v));
    if (m.loop && s.prop === 'rot' && monotonic) continue; // a wheel or coin spinning at constant speed
    err('slow-in-out', `${s.track} f${s.from}→${s.to} đi đều (linear) — trông như máy; dùng in/out/inOut hoặc thêm key`);
  }
  // A track may stop at full speed (an impact) only if something else carries the motion on,
  // or its part vanishes there (a coin flying into the HUD).
  const vanishes = (part) => {
    const a = m.tracks[`${part}.alpha`];
    return !!a && a[a.length - 1].v <= 0.05;
  };
  for (const [track, keys] of Object.entries(m.tracks)) {
    if (m.loop || keys.length < 2) continue;
    const last = keys[keys.length - 1];
    const { part, prop } = splitTrack(track);
    if (last.f >= lastMove && !vanishes(part) && Math.abs(last.v - keys[keys.length - 2].v) > EPS[prop] && ['in', 'inBack', 'linear'].includes(last.ease ?? DEFAULT_EASE))
      warn('slow-in-out', `${track} dừng ở f${last.f} khi đang nhanh nhất (${last.ease}) và không còn gì chuyển động tiếp — thêm một nhịp settle (out)`);
  }

  // A cycle (walk, run, idle) has no start or end: anticipation and follow-through are one-shot rules.
  const oneShot = !m.loop;
  let prepFrom = null;
  if (oneShot) {
    // Anticipation: something prepares before the action, and the action track does not start the same way.
    const before = moving.filter((s) => s.to <= main.from);
    prepFrom = before.length ? Math.min(...before.map((s) => s.from)) : null;
    const sameWay = before.filter((s) => s.track === main.track).reduce((a, s) => a + s.dv, 0);
    const prep = prepFrom == null ? 0 : at60(m, main.from - prepFrom);
    if (prepFrom != null) info.anticipation = { from: prepFrom, to: main.from };
    if (Math.sign(sameWay) === Math.sign(main.dv) && Math.abs(sameWay) > Math.abs(main.dv) * 0.1)
      err('anticipation', `${main.track} trước action đi cùng hướng với action — đó là khởi động chậm, không phải chuẩn bị; lùi ngược hướng trước`);
    if (NEEDS_ANTICIPATION.has(role) && prepFrom == null)
      err('anticipation', `${role}: không có chuẩn bị trước ${main.track} f${main.from} — thêm pose ngược hướng (nén, lùi, nghiêng) trước action`);
    if (role === 'telegraph' && prepFrom != null && prep < TELEGRAPH_MIN)
      err('anticipation', `telegraph: chuẩn bị ${fmt(prep)} khung@60 < ${TELEGRAPH_MIN} — người chơi không kịp phản ứng`);
    if (role === 'player-action' && prep > PLAYER_ANTICIPATION_MAX)
      err('anticipation', `player-action: chuẩn bị ${fmt(prep)} khung@60 > ${PLAYER_ANTICIPATION_MAX} — điều khiển bị trễ; nén 2–4 khung, core xử lý input ngay`);
    if (role === 'player-action' && prepFrom == null) warn('anticipation', 'player-action: chưa có nhịp nén ngắn (2–4 khung) trước action');
    if (role === 'reaction' && at60(m, main.from) > REACTION_START_MAX)
      err('anticipation', `reaction: action bắt đầu ở f${main.from} — phản ứng va chạm phải vào ngay (≤ ${REACTION_START_MAX} khung@60), không chuẩn bị`);

    // Follow-through: the motion does not stop dead when the action ends.
    if (lastMove > main.to) info.followUntil = lastMove;
    if (NEEDS_FOLLOW.has(role) && lastMove <= main.to && !vanishes(main.part))
      err('follow-through', `mọi thứ dừng cùng lúc action kết thúc (f${main.to}) — thêm overshoot/settle hoặc để phần phụ chuyển động tiếp`);
    if (role === 'ui') {
      const vEnd = m.tracks[main.track][m.tracks[main.track].length - 1].v;
      const dir = Math.sign(main.dv);
      const after = m.tracks[main.track].filter((k) => k.f >= main.to);
      const overshoots =
        after.some((k) => dir * (k.v - vEnd) > EPS[main.prop]) || segs.some((s) => s.track === main.track && s.from >= main.from && OVERSHOOT_EASES.has(s.ease));
      if (!overshoots) warn('follow-through', `ui: ${main.track} không vượt quá đích rồi về — thêm overshoot (outBack hoặc một key quá đà)`);
    }
  }

  // Back to rest: a one-shot that ends off its rest pose snaps when the idle loop takes over.
  if (oneShot && role !== 'fx') {
    for (const [track, keys] of Object.entries(m.tracks)) {
      const { part, prop } = splitTrack(track);
      const v = keys[keys.length - 1].v;
      if (Math.abs(v - REST[prop]) > EPS[prop] * 2 && !vanishes(part))
        warn('rest', `${track} kết thúc ở ${fmt(v)}, không phải pose nghỉ (${REST[prop]}) — về idle sẽ giật; đưa về ${REST[prop]}, hoặc để core/ dời vị trí thật`);
    }
  }

  // Squash and stretch: bodies that travel deform; deforming keeps volume.
  if (CHARACTER.has(role) && POSITION.has(main.prop) && !moving.some((s) => DEFORM.has(s.prop)))
    warn('squash-stretch', `${main.track} di chuyển nhưng không phần nào co giãn — thêm stretch (giãn khi nhanh, bẹp khi chạm)`);
  if (role !== 'ui' && role !== 'fx') {
    for (const part of new Set(Object.keys(m.tracks).map((t) => splitTrack(t).part))) {
      const sx = m.tracks[`${part}.sx`];
      const sy = m.tracks[`${part}.sy`];
      if (!sx || !sy) continue;
      for (let f = 0; f <= D; f++) {
        const a = sampleKeys(sx, f);
        const b = sampleKeys(sy, f);
        if (Math.abs(a - b) > 0.05 && (a * b < 0.75 || a * b > 1.33)) {
          warn('squash-stretch', `${part} f${f}: sx·sy = ${fmt(a * b)} — mất khối; dùng ${part}.stretch hoặc giữ sx·sy ≈ 1`);
          break;
        }
      }
    }
  }

  // Overlapping action: parts do not start and stop on the same frame.
  const parts = {};
  for (const s of moving) {
    const p = (parts[s.part] ??= { start: s.from, end: s.to });
    p.start = Math.min(p.start, s.from);
    p.end = Math.max(p.end, s.to);
  }
  const spans = Object.values(parts);
  if (oneShot && spans.length > 1 && spans.every((p) => p.start === spans[0].start && p.end === spans[0].end))
    warn('overlap', `${Object.keys(parts).join(', ')} cùng bắt đầu f${spans[0].start} và dừng f${spans[0].end} — lệch 2–4 khung cho phần phụ (tóc, tai, đuôi, mũ)`);

  // Arcs: x and y keyed together with one ease draw a straight line.
  for (const part of Object.keys(parts)) {
    const xs = moving.filter((s) => s.track === `${part}.x`);
    const ys = moving.filter((s) => s.track === `${part}.y`);
    const straight = xs.find((x) => ys.some((y) => y.from === x.from && y.to === x.to && y.ease === x.ease));
    if (straight) warn('arcs', `${part} f${straight.from}→${straight.to}: x và y cùng key, cùng ease → đường thẳng; cho x và y ease khác nhau hoặc lệch key để đi theo cung`);
  }

  // Timing: contrast, and the action is quicker than its preparation.
  if (oneShot && NEEDS_ANTICIPATION.has(role) && prepFrom != null && main.to - main.from > main.from - prepFrom)
    warn('timing', `action (${main.to - main.from} khung) chậm hơn chuẩn bị (${main.from - prepFrom}) — cartoon: chuẩn bị lâu, action dứt khoát`);
  const lengths = moving.map((s) => s.to - s.from);
  if (lengths.length >= 4 && Math.max(...lengths) <= Math.min(...lengths) * 1.25)
    warn('timing', `mọi đoạn dài gần bằng nhau (${Math.min(...lengths)}–${Math.max(...lengths)} khung) — nhịp đều, thiếu tương phản nhanh/chậm`);
  if (role === 'ui' && at60(m, D) > UI_MAX) warn('timing', `ui dài ${fmt(at60(m, D))} khung@60 > ${UI_MAX} — người chơi phải chờ`);
  if (role === 'idle' && at60(m, D) < IDLE_MIN) warn('timing', `idle chỉ ${fmt(at60(m, D))} khung@60 — thở quá nhanh, trông lo lắng`);

  return finish(m, errors, warnings, info);
}

function finish(m, errors, warnings, info) {
  const skip = m.skip ?? {};
  const waived = Object.entries(skip).map(([check, why]) => ({ check, msg: why }));
  return { errors: errors.filter((e) => !skip[e.check]), warnings: warnings.filter((w) => !skip[w.check]), waived, info };
}

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const BARS = '▁▂▃▄▅▆▇█';

/**
 * Text timing chart: one sparkline per track (y drawn so up on the chart = up on screen),
 * the anticipation / action / follow-through spans and every key. Agents read it in place of watching.
 */
export function chartMotion(m, { width = 72 } = {}) {
  const D = motionFrames(m);
  const step = Math.max(1, Math.ceil((D + 1) / width));
  const cols = Math.floor(D / step) + 1;
  const frameOf = (c) => c * step;
  const colOf = (f) => Math.min(cols - 1, Math.round(f / step));
  const names = Object.keys(m.tracks);
  const pad = Math.max(8, ...names.map((n) => n.length + 2));
  const row = (label, chars) => `${label.padEnd(pad)}${chars.join('')}`;
  const lines = [`${m.name} · ${m.role} · ${D} khung @${m.fps ?? 60} = ${fmt(D / (m.fps ?? 60))} s${m.loop ? ' · lặp' : ''}${m.step ? ` · giữ pose ${m.step}/s` : ''}${step > 1 ? ` · 1 cột = ${step} khung` : ''}`];

  const ruler = Array(cols).fill(' ');
  for (let f = 0; f <= D; f += 10) {
    const s = String(f);
    const c = colOf(f);
    if (c + s.length <= cols && ruler.slice(c, c + s.length).every((ch) => ch === ' ')) for (let i = 0; i < s.length; i++) ruler[c + i] = s[i];
  }
  lines.push(row('khung', ruler));

  const { info } = analyzeMotion(m);
  if (info.main && !m.loop) {
    const beats = Array(cols).fill(' ');
    const fill = (from, to, ch) => {
      for (let c = colOf(from); c <= colOf(to); c++) beats[c] = ch;
    };
    if (info.anticipation) fill(info.anticipation.from, info.anticipation.to, '·');
    if (info.followUntil != null) fill(info.main.to, info.followUntil, '~');
    fill(info.main.from, info.main.to, '━');
    lines.push(row('nhịp', beats));
  }
  const keys = Array(cols).fill(' ');
  for (const k of Object.values(m.tracks).flat()) keys[colOf(k.f)] = '|';
  lines.push(row('key', keys));

  for (const name of names) {
    const tk = m.tracks[name];
    const flip = splitTrack(name).prop === 'y' ? -1 : 1; // screen y grows downwards
    // A column spanning several frames shows its most extreme one, so a 3-frame blink is not lost.
    const vals = Array.from({ length: cols }, (_, c) => {
      let best = sampleKeys(tk, frameOf(c));
      for (let f = frameOf(c) + 1; f < frameOf(c) + step && f <= D; f++) {
        const v = sampleKeys(tk, f);
        if (Math.abs(v - tk[0].v) > Math.abs(best - tk[0].v)) best = v;
      }
      return best;
    });
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const bar = vals.map((v) => {
      if (hi - lo < 1e-9) return BARS[3];
      const t = flip > 0 ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo);
      return BARS[Math.round(t * (BARS.length - 1))];
    });
    lines.push(`${row(name + (flip < 0 ? '↑' : ''), bar)}  ${fmt(+lo.toFixed(3))}…${fmt(+hi.toFixed(3))}`);
  }
  lines.push(`${''.padEnd(pad)}${info.main && !m.loop ? '· chuẩn bị  ━ action  ~ follow-through  ' : ''}| key${names.some((n) => n.endsWith('.y')) ? '  ↑ y vẽ ngược (lên = lên màn hình)' : ''}`);
  return lines.join('\n');
}
