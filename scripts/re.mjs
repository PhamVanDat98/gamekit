// gamekit re — follow the reverse-engineering loop (P1): question → analysis step → evidence → conclusion.
// Steps come from the RE journal (notes/re-log.jsonl), written by the Claude Code hook for REA / RE
// command-line tools, or by hand with `gamekit re log`. `--watch` redraws whenever the journal changes.
import fs from 'node:fs';
import path from 'node:path';
import { exists } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame, ownershipOf, nowIso, OWNERSHIP_LABEL } from './lib/game.mjs';
import { phaseInfo } from './lib/phases.mjs';
import {
  LOG_FILE,
  QUESTIONS_FILE,
  appendEntry,
  compact,
  isEvidenceId,
  loadQuestions,
  readFocus,
  readLog,
  shortEv,
  unloggedEvidence,
  writeFocus,
} from './lib/relog.mjs';

const KINDS = ['note', 'inspect', 'conclude'];
const KIND_LABEL = { note: 'ghi chú', conclude: 'kết luận', focus: 'chuyển sang' };

/** Everything `re` shows, as data (also used by `gate` {auto: re} and `--json`). */
export function reReport(root, { last = 8 } = {}) {
  const game = loadGame(root);
  const ownership = ownershipOf(game);
  const questions = loadQuestions(root);
  const { entries, bad } = readLog(root);
  const focus = readFocus(root);
  const errors = [];
  const warnings = [];

  if (!questions) warnings.push(`chưa có ${QUESTIONS_FILE} — viết câu hỏi trước khi phân tích`);
  const ids = new Set();
  for (const q of questions ?? []) {
    if (ids.has(q.id)) errors.push(`${QUESTIONS_FILE}: trùng ${q.id}`);
    ids.add(q.id);
    if (!q.state) errors.push(`${QUESTIONS_FILE}: ${q.id} có trạng thái "${q.rawState}" — dùng: mở · một phần · đã trả lời`);
    else if (q.state === 'đã trả lời' && !q.conclusion) errors.push(`${QUESTIONS_FILE}: ${q.id} đã trả lời nhưng cột kết luận trống — ghi kết luận hoặc link ghi chú`);
  }
  if (bad.length) errors.push(`${LOG_FILE}: dòng không phải JSON: ${bad.slice(0, 5).join(', ')}`);
  for (const c of unloggedEvidence(root, entries)) errors.push(`${c.where}: evidence ${shortEv(c.id)} không có trong ${LOG_FILE}`);

  const steps = entries.filter((e) => e.kind === 'inspect');
  const stats = new Map();
  for (const e of entries) {
    if (!e.q || e.kind === 'focus') continue;
    const s = stats.get(e.q) ?? { steps: 0, notes: 0, evidence: new Set(), lastAt: null };
    if (e.kind === 'inspect') s.steps++;
    else s.notes++;
    for (const id of e.evidence ?? []) s.evidence.add(id);
    s.lastAt = e.at ?? s.lastAt;
    stats.set(e.q, s);
  }

  if (questions) {
    const stray = [...stats.keys()].filter((q) => !ids.has(q));
    if (stray.length) warnings.push(`nhật ký nhắc tới câu không có trong ${QUESTIONS_FILE}: ${stray.join(', ')}`);
    if (focus?.q && !ids.has(focus.q)) warnings.push(`đang làm ${focus.q} nhưng ${QUESTIONS_FILE} không có câu này`);
    else if (focus?.q && questions.find((q) => q.id === focus.q)?.state === 'đã trả lời')
      warnings.push(`đang làm ${focus.q} nhưng câu này đã trả lời — \`gamekit re focus <câu khác>\``);
  }
  const loose = steps.filter((e) => !e.q).length;
  if (loose) warnings.push(`${loose} bước phân tích chưa gắn câu hỏi — chạy \`gamekit re focus Q#\` trước khi phân tích`);
  const byKey = new Map();
  for (const e of steps) if (e.key) byKey.set(e.key, [...(byKey.get(e.key) ?? []), e]);
  for (const group of byKey.values())
    if (group.length > 1) warnings.push(`phân tích y hệt chạy ${group.length} lần: ${describe(group[0])} — đọc lại kết quả/ghi chú thay vì chạy lại`);
  const limited = steps.filter((e) => e.limits?.length);
  if (limited.length)
    warnings.push(`${limited.length} kết quả chưa đầy đủ (${[...new Set(limited.flatMap((e) => e.limits))].join('/')}), vd ${describe(limited.at(-1))} — không kết luận "không có" từ các kết quả này`);
  if (ownership === 'third-party') {
    const runtime = steps.filter((e) => e.runtime);
    if (runtime.length) warnings.push(`game làm lại của người khác chỉ được phân tích file tĩnh, nhưng nhật ký có ${runtime.length} lần chạy/gắn vào game: ${[...new Set(runtime.map((e) => e.tool))].join(', ')}`);
  }

  const qs = (questions ?? []).map((q) => {
    const s = stats.get(q.id);
    return { ...q, steps: s?.steps ?? 0, notes: s?.notes ?? 0, evidence: s?.evidence.size ?? 0, lastAt: s?.lastAt ?? null };
  });
  const count = (state) => qs.filter((q) => q.state === state).length;
  return {
    game: { name: game.name, title: game.title, phase: game.phase, ownership },
    focus: focus?.q ?? null,
    questions: qs,
    totals: {
      questions: qs.length,
      answered: count('đã trả lời'),
      partial: count('một phần'),
      open: count('mở'),
      steps: steps.length,
      evidence: new Set(entries.flatMap((e) => e.evidence ?? [])).size,
      errored: steps.filter((e) => e.error).length,
      lastAt: entries.at(-1)?.at ?? null,
    },
    recent: entries.slice(-last),
    errors,
    warnings,
  };
}

// cli steps keep the whole command as target; the tool name would only repeat it.
const describe = (e) => (e.via === 'cli' ? e.target : [e.via === 'rea' ? `rea ${e.tool}` : e.tool, e.target].filter(Boolean).join(' '));
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - [...s].length));

function hhmm(at) {
  const d = new Date(at);
  if (Number.isNaN(+d)) return '--:--';
  const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === new Date().toDateString() ? t : `${d.getDate()}/${d.getMonth() + 1} ${t}`;
}

function ago(at) {
  const m = (Date.now() - new Date(at)) / 6e4;
  if (!(m >= 0)) return '';
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${Math.floor(m)} phút trước`;
  if (m < 1440) return `${Math.floor(m / 60)} giờ trước`;
  return `${Math.floor(m / 1440)} ngày trước`;
}

/** The report as printable lines: [kind, text], kind = head | info | dim | warn | fail. */
export function renderReport(r) {
  const out = [];
  const g = r.game;
  const phase = g.phase === 'released' ? 'đã phát hành' : `${g.phase} ${phaseInfo(g.phase, g.ownership).name}`;
  out.push(['head', `Theo dõi RE — ${g.title ?? g.name} (${phase}, ${OWNERSHIP_LABEL[g.ownership] ?? g.ownership})`]);
  const t = r.totals;
  out.push(['info', `Câu hỏi: ${t.questions} — đã trả lời ${t.answered} · một phần ${t.partial} · mở ${t.open}`]);
  out.push([
    'info',
    `Nhật ký: ${t.steps} bước phân tích · ${t.evidence} evidence${t.errored ? ` · ${t.errored} lỗi công cụ` : ''}${t.lastAt ? ` · lần cuối ${hhmm(t.lastAt)} (${ago(t.lastAt)})` : ''}`,
  ]);
  out.push(['info', `Đang làm: ${r.focus ?? 'chưa chọn — `gamekit re focus Q#`'}`]);
  if (r.questions.length) {
    out.push(['info', '']);
    for (const q of r.questions) {
      const act = q.steps || q.notes || q.evidence ? `${q.steps} bước · ${q.evidence} evidence${q.notes ? ` · ${q.notes} ghi chú` : ''}` : 'chưa có bước nào';
      const mark = q.id === r.focus ? '  ← đang làm' : '';
      const concl = q.conclusion ? `  → ${clip(q.conclusion, 40)}` : '';
      out.push(['info', `  ${pad(q.id, 4)} ${pad(q.state ?? `?${q.rawState}`, 11)} ${pad(clip(q.text, 44), 44)}  ${act}${concl}${mark}`]);
    }
  }
  if (r.recent.length) {
    out.push(['info', '\nGần đây:']);
    for (const e of r.recent) {
      const what = e.kind === 'inspect' ? describe(e) : `${KIND_LABEL[e.kind] ?? e.kind}${e.text ? `: ${e.text}` : ''}`;
      const ev = e.evidence?.length ? `  ${e.evidence.slice(0, 2).map(shortEv).join(' ')}${e.evidence.length > 2 ? ` +${e.evidence.length - 2}` : ''}` : '';
      const flags = [...(e.limits ?? []), e.error ? 'lỗi' : null, e.runtime ? 'chạy game' : null].filter(Boolean);
      out.push(['dim', `  ${hhmm(e.at)}  ${pad(e.q ?? '—', 4)} ${clip(what, 90)}${ev}${flags.length ? `  [${flags.join(', ')}]` : ''}`]);
    }
  }
  if (r.warnings.length || r.errors.length) out.push(['info', '']);
  for (const w of r.warnings) out.push(['warn', w]);
  for (const e of r.errors) out.push(['fail', e]);
  return out;
}

const print = (lines) => {
  for (const [kind, text] of lines) log[kind](text);
};

function questionOrFail(root, q) {
  const id = String(q).toUpperCase();
  if (!/^Q\d+$/.test(id)) throw new GkError(`"${q}" không phải mã câu hỏi (Q1, Q2…)`);
  const questions = loadQuestions(root);
  if (!questions?.some((x) => x.id === id)) throw new GkError(`${QUESTIONS_FILE} không có ${id} — thêm câu hỏi trước`);
  return id;
}

function entryBase(root) {
  let phase;
  try {
    phase = loadGame(root).phase;
  } catch {
    /* validate reports a broken game.yaml */
  }
  return { at: nowIso(), phase };
}

function focusCmd(root, args) {
  if (args.clear) {
    writeFocus(root, null);
    log.ok('Đã bỏ câu đang làm.');
    return 0;
  }
  if (!args._[1]) throw new GkError('Dùng: gamekit re focus <Q#> | --clear');
  const q = questionOrFail(root, args._[1]);
  writeFocus(root, q, nowIso());
  appendEntry(root, compact({ ...entryBase(root), q, kind: 'focus' }));
  log.ok(`Đang làm ${q} — các bước phân tích sau đây được gắn vào câu này.`);
  return 0;
}

function logCmd(root, args) {
  const text = args._.slice(1).join(' ').trim();
  if (!text) throw new GkError('Dùng: gamekit re log "<tóm tắt>" [--kind note|inspect|conclude] [--q Q#] [--tool tên] [--evidence ev_…]');
  const kind = args.kind ?? 'note';
  if (!KINDS.includes(kind)) throw new GkError(`--kind phải là một trong: ${KINDS.join(', ')}`);
  const evidence = [].concat(args.evidence ?? []).flatMap((s) => String(s).split(',')).map((s) => s.trim()).filter(Boolean);
  const badEv = evidence.filter((s) => !isEvidenceId(s));
  if (badEv.length) throw new GkError(`evidence phải là id REA dạng ev_ + 64 ký tự hex: ${badEv.join(', ')}`);
  const q = args.q ? questionOrFail(root, args.q) : readFocus(root)?.q;
  const entry = compact({
    ...entryBase(root),
    q,
    kind,
    via: kind === 'inspect' ? 'manual' : undefined,
    tool: args.tool ? String(args.tool) : undefined,
    target: kind === 'inspect' ? text : undefined,
    text: kind === 'inspect' ? undefined : text,
    evidence,
  });
  appendEntry(root, entry);
  log.ok(`Đã ghi vào ${LOG_FILE}${q ? ` (${q})` : ' — chưa gắn câu hỏi nào'}`);
  return 0;
}

function watch(root, opts) {
  const tty = process.stdout.isTTY;
  const draw = () => {
    if (tty) process.stdout.write('\x1b[2J\x1b[H');
    else log.dim(`— ${hhmm(new Date().toISOString())} —`);
    try {
      print(renderReport(reReport(root, opts)));
    } catch (e) {
      log.fail(e.message);
    }
    log.dim('\nĐang theo dõi nhật ký RE — Ctrl+C để thoát.');
  };
  draw();
  let timer;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(draw, 200);
  };
  fs.mkdirSync(path.join(root, '.gamekit', 'local'), { recursive: true });
  const watchers = ['notes', '.gamekit/local', 'params', 'spec']
    .map((d) => path.join(root, d))
    .filter(exists)
    .map((d) => {
      try {
        return fs.watch(d, { recursive: true }, later);
      } catch {
        return fs.watch(d, later); // platforms without recursive watch
      }
    });
  const tick = setInterval(draw, 30000); // keeps "N phút trước" honest
  return new Promise((resolve) => {
    process.once('SIGINT', () => {
      clearInterval(tick);
      clearTimeout(timer);
      for (const w of watchers) w.close();
      resolve(0);
    });
  });
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const sub = args._[0] ?? 'status';
  if (sub === 'focus') return focusCmd(root, args);
  if (sub === 'log') return logCmd(root, args);
  if (sub !== 'status') throw new GkError(`Không có "re ${sub}". Dùng: gamekit re [status] [--watch] [--json] · re focus <Q#> · re log "<tóm tắt>"`);
  const last = args.last ? Number(args.last) : 8;
  if (!Number.isInteger(last) || last < 0) throw new GkError('--last phải là số nguyên ≥ 0');
  if (args.watch) return watch(root, { last });
  const report = reReport(root, { last });
  if (args.json) log.info(JSON.stringify(report, null, 2));
  else print(renderReport(report));
  return report.errors.length ? 1 : 0;
}
