// RE journal: every analysis step of the original game, so the investigation can be followed live
// (`gamekit re --watch`) and every number in params/ can point back to the step that produced it.
// One JSON object per line in notes/re-log.jsonl (committed with the notes). Only what was asked
// (tool, target, evidence ids, limits) is kept — never the tool's output, so no decompiled code lands here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { exists, readJson, readYaml, walk } from './io.mjs';

export const LOG_FILE = 'notes/re-log.jsonl';
export const QUESTIONS_FILE = 'notes/QUESTIONS.md';
const FOCUS_FILE = '.gamekit/local/re-focus.json';

/** REA Evidence id: ev_ + sha256. */
export const EVIDENCE_RE = /\bev_[0-9a-f]{64}\b/g;
export const isEvidenceId = (s) => /^ev_[0-9a-f]{64}$/.test(s);
export const shortEv = (id) => `${id.slice(0, 11)}…`;

// ---------- questions (notes/QUESTIONS.md) ----------
export const STATES = { mo: 'mở', 'mot phan': 'một phần', 'da tra loi': 'đã trả lời' };
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

/** Rows `| Q1 | câu hỏi | bằng chứng | trạng thái | kết luận |`. Columns found by header, template order as fallback. */
export function parseQuestions(text) {
  const rows = [];
  let col = { question: 1, need: 2, state: 3, conclusion: 4 };
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());
    const id = cells[0].replace(/[`*]/g, '');
    if (/^#$/.test(id)) {
      const find = (word, d) => {
        const i = cells.findIndex((c) => fold(c).includes(word));
        return i < 0 ? d : i;
      };
      col = { question: find('cau hoi', 1), need: find('bang chung', 2), state: find('trang thai', 3), conclusion: find('ket luan', 4) };
      continue;
    }
    if (!/^Q\d+$/i.test(id)) continue;
    const rawState = (cells[col.state] ?? '').replace(/[`*]/g, '');
    rows.push({
      id: id.toUpperCase(),
      text: cells[col.question] ?? '',
      need: cells[col.need] ?? '',
      rawState,
      state: STATES[fold(rawState)] ?? null,
      conclusion: cells[col.conclusion] ?? '',
    });
  }
  return rows;
}

export function loadQuestions(root) {
  const f = path.join(root, QUESTIONS_FILE);
  return exists(f) ? parseQuestions(fs.readFileSync(f, 'utf8')) : null;
}

// ---------- journal ----------
export function readLog(root) {
  const f = path.join(root, LOG_FILE);
  if (!exists(f)) return { entries: [], bad: [] };
  const entries = [];
  const bad = [];
  fs.readFileSync(f, 'utf8')
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (!line.trim()) return;
      try {
        entries.push(JSON.parse(line));
      } catch {
        bad.push(i + 1);
      }
    });
  return { entries, bad };
}

export function appendEntry(root, entry) {
  const f = path.join(root, LOG_FILE);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, JSON.stringify(entry) + '\n');
}

export function readFocus(root) {
  try {
    return readJson(path.join(root, FOCUS_FILE));
  } catch {
    return null;
  }
}

export function writeFocus(root, q, at) {
  const f = path.join(root, FOCUS_FILE);
  if (!q) return fs.rmSync(f, { force: true });
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ q, at }) + '\n');
}

// ---------- classifying a tool call ----------
// Command-line RE tools recognised in a shell command (REA's own CLI included).
const CLI_TOOLS = [
  ['ghidra', /\banalyzeHeadless\b|\bghidraRun\b/i],
  ['ilspy', /\bilspycmd\b/i],
  ['il2cppdumper', /\bIl2CppDumper\b/i],
  ['cpp2il', /\bCpp2IL\b/i],
  ['assetripper', /\bAssetRipper\b/i],
  ['uabea', /\bUABEA\b/i],
  ['jadx', /\bjadx\b/],
  ['apktool', /\bapktool\b/],
  ['gdre', /\bgdre_tools\b/i],
  ['ffdec', /\bffdec\b/i],
  ['wabt', /\bwasm2wat\b|\bwasm-objdump\b|\bwasm-decompile\b/],
  ['rizin', /\brizin\b|\bradare2\b/],
  ['objdump', /\bobjdump\b|\breadelf\b/],
  ['binwalk', /\bbinwalk\b/],
  ['rea', /(^|[\s;&|(])(npx\s+(-y\s+)?)?rea(-agents(@\S+)?)?\s+[a-z]/],
];
// REA tools that run or attach to the target instead of reading files (not allowed for third-party games).
const RUNTIME_TOOL = /^(capture|observe|frida|adb|gdb|launch|attach|interact|run)_/;
// Inputs worth showing as "what was looked at".
const TARGET_KEYS = ['path', 'binary', 'binary_path', 'file', 'target', 'artifact', 'application', 'url', 'function', 'function_name', 'name', 'address', 'symbol', 'query', 'feature', 'module'];

const clip = (s, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
const keyOf = (tool, input) => crypto.createHash('sha1').update(`${tool}\n${stableJson(input ?? null)}`).digest('hex').slice(0, 16);

function targetOf(input) {
  if (!input || typeof input !== 'object') return '';
  const parts = [];
  for (const k of TARGET_KEYS) {
    const v = input[k];
    if (v == null || typeof v === 'object') continue;
    const s = String(v);
    parts.push(/[\\/]/.test(s) && k !== 'url' ? path.basename(s) : s);
  }
  return clip(parts.join(' '));
}

/** What a tool reply says about its own limits. Read from the reply text; nothing of it is stored. */
function limitsOf(text) {
  const out = [];
  if (/"truncated"\s*:\s*true|"status"\s*:\s*"truncated"/.test(text)) out.push('truncated');
  if (/"status"\s*:\s*"unknown"/.test(text)) out.push('unknown');
  return out;
}

/**
 * A journal entry for a Claude Code PostToolUse event, or null when the call is not RE work.
 * `hook` = the hook's JSON input ({ tool_name, tool_input, tool_response }).
 */
export function entryFromToolUse(hook) {
  const name = hook?.tool_name ?? '';
  const input = hook?.tool_input ?? {};
  let reply = '';
  try {
    reply = typeof hook?.tool_response === 'string' ? hook.tool_response : JSON.stringify(hook?.tool_response ?? '');
  } catch {
    reply = '';
  }
  const evidence = [...new Set(reply.match(EVIDENCE_RE) ?? [])].slice(0, 20);
  const mcp = name.match(/^mcp__(?:plugin_[^_]+_)?rea__(.+)$/);
  if (mcp) {
    const tool = mcp[1];
    return {
      kind: 'inspect',
      via: 'rea',
      tool,
      target: targetOf(input),
      key: keyOf(`rea:${tool}`, input),
      evidence,
      limits: limitsOf(reply),
      error: /"isError"\s*:\s*true/.test(reply) || undefined,
      runtime: RUNTIME_TOOL.test(tool) || undefined,
    };
  }
  if (name === 'Bash') {
    const cmd = String(input.command ?? '');
    if (/\bgamekit(\.mjs)?\b|\bgk\b/.test(cmd)) return null;
    const hit = CLI_TOOLS.find(([, re]) => re.test(cmd));
    if (!hit) return null;
    return {
      kind: 'inspect',
      via: 'cli',
      tool: hit[0],
      target: clip(cmd.replace(/\s+/g, ' ').trim()),
      key: keyOf(`cli:${cmd.trim()}`, null),
      evidence,
      limits: limitsOf(reply),
    };
  }
  return null;
}

/** Drop empty fields so the journal stays readable. */
export function compact(entry) {
  return Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)));
}

// ---------- evidence cited by the game data ----------
const tryRead = (f, read) => {
  try {
    return read(f);
  } catch {
    return null; // unreadable files are reported by validate
  }
};

function collectEvidence(obj, prefix, out) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if ('value' in v) out.push([key, v.evidence]);
    else collectEvidence(v, key, out);
  }
  return out;
}

/** Every REA evidence id cited in params/, spec/oracles/ and spec/obligations.yaml, with where. */
export function citedEvidence(root) {
  const out = [];
  const take = (where, ids) => {
    for (const id of Array.isArray(ids) ? ids : []) out.push({ id, where });
  };
  const pdir = path.join(root, 'params');
  for (const rel of walk(pdir).filter((f) => f.endsWith('.json'))) {
    for (const [key, ids] of collectEvidence(tryRead(path.join(pdir, rel), readJson), '', [])) take(`params/${rel} ${key}`, ids);
  }
  const odir = path.join(root, 'spec', 'oracles');
  for (const rel of walk(odir).filter((f) => f.endsWith('.json'))) take(`spec/oracles/${rel}`, tryRead(path.join(odir, rel), readJson)?.evidence);
  const ob = tryRead(path.join(root, 'spec', 'obligations.yaml'), (f) => (exists(f) ? readYaml(f) : null));
  for (const o of Array.isArray(ob?.obligations) ? ob.obligations : []) take(`spec/obligations.yaml ${o?.id}`, o?.evidence);
  return out;
}

/** Cited evidence ids that the journal never recorded. */
export function unloggedEvidence(root, entries = readLog(root).entries) {
  const logged = new Set(entries.flatMap((e) => e.evidence ?? []));
  return citedEvidence(root).filter((c) => !logged.has(c.id));
}
