// gamekit oracle import — turn a trace recorded from the original game (CSV, JSONL, JSON array) into an oracle
// table spec/oracles/<id>.json that parity tests loop over. The trace is the evidence; this only picks rows.
import fs from 'node:fs';
import path from 'node:path';
import { exists, writeJson, toPosix } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot } from './lib/game.mjs';
import { check } from './lib/schema.mjs';

const DEFAULT_MAX = 40;

/** Nested objects → dotted keys ({ player: { x: 1 } } → { "player.x": 1 }). */
export function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const num = (s) => {
  const t = String(s).trim();
  if (t === '') return null;
  if (t === 'true' || t === 'false') return t === 'true';
  return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t) ? Number(t) : t;
};

/** Rows of a trace: CSV/TSV with a header line, JSON Lines, or a JSON array of objects. */
export function parseTrace(text, name = '') {
  const body = text.replace(/^﻿/, '').trim();
  if (!body) throw new GkError(`${name}: trace rỗng`);
  if (/\.jsonl$/i.test(name) || (body.startsWith('{') && body.includes('\n'))) {
    return body.split(/\r?\n/).filter((l) => l.trim()).map((l, i) => {
      try {
        return flatten(JSON.parse(l));
      } catch (e) {
        throw new GkError(`${name}: dòng ${i + 1} không phải JSON (${e.message})`);
      }
    });
  }
  if (body.startsWith('[')) return JSON.parse(body).map((o) => flatten(o));
  const lines = body.split(/\r?\n/).filter((l) => l.trim());
  const sep = [',', ';', '\t'].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const head = lines[0].split(sep).map((h) => h.trim());
  return lines.slice(1).map((l) => Object.fromEntries(l.split(sep).map((v, i) => [head[i], num(v)])));
}

/** Keep `max` rows spread evenly, always the first and the last. */
export function thin(rows, max) {
  if (rows.length <= max) return rows;
  if (max < 2) return rows.slice(0, max);
  return Array.from({ length: max }, (_, i) => rows[Math.round((i * (rows.length - 1)) / (max - 1))]);
}

/**
 * Pick rows → cases. opts: { in: [cols], out: [cols], at?: { col, values }, every?, max? }.
 * One out column → out is a number; several → an object.
 */
export function buildCases(rows, opts) {
  for (const c of [...opts.in, ...opts.out]) if (!rows.some((r) => c in r)) throw new GkError(`trace không có cột "${c}" (có: ${Object.keys(rows[0] ?? {}).join(', ')})`);
  let picked = rows.filter((r) => [...opts.in, ...opts.out].every((c) => r[c] !== null && r[c] !== undefined));
  if (opts.at) {
    const { col, values } = opts.at;
    picked = values.map((v) => {
      let best = null;
      for (const r of picked) if (typeof r[col] === 'number' && (!best || Math.abs(r[col] - v) < Math.abs(best[col] - v))) best = r;
      if (!best) throw new GkError(`--at: không có dòng nào cho ${col}=${v}`);
      return best;
    });
  } else if (opts.every) picked = picked.filter((_, i) => i % opts.every === 0);
  const seen = new Set();
  const cases = [];
  for (const r of picked) {
    const input = Object.fromEntries(opts.in.map((c) => [c, r[c]]));
    const key = JSON.stringify(input);
    if (seen.has(key)) continue;
    seen.add(key);
    const out = opts.out.length === 1 ? r[opts.out[0]] : Object.fromEntries(opts.out.map((c) => [c, r[c]]));
    cases.push({ in: input, out });
  }
  return opts.at ? cases : thin(cases, opts.max ?? DEFAULT_MAX);
}

const list = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function parseAt(v) {
  const m = /^([^=]+)=(.+)$/.exec(String(v));
  if (!m) throw new GkError('--at dạng cột=giá trị,giá trị… (vd --at t=0,5,10,30)');
  const values = list(m[2]).map(Number);
  if (values.some(Number.isNaN)) throw new GkError('--at: giá trị phải là số');
  return { col: m[1].trim(), values };
}

export async function run(args) {
  const [sub, trace] = args._;
  if (sub !== 'import' || !trace)
    throw new GkError('Dùng: gamekit oracle import <trace.csv|.jsonl|.json> --to spec/oracles/<id>.json --in t[,level] --out speed[,…] --source "…" [--confidence observed|derived|inferred] [--tolerance 0.01] [--at t=0,5,10 | --every N] [--max 40] [--description "…"] [--force]');
  const root = requireGameRoot(args.cwd);
  const cwd = args.cwd ?? process.cwd();
  if (!args.to || args.to === true) throw new GkError('Thiếu --to spec/oracles/<id>.json');
  const to = path.resolve(cwd, String(args.to));
  const rel = toPosix(path.relative(root, to));
  if (!/^spec\/oracles\/[^/]+\.json$/.test(rel)) throw new GkError(`--to phải nằm trong spec/oracles/ (nhận ${rel})`);
  if (exists(to) && !args.force) throw new GkError(`${rel} đã có — thêm --force để ghi đè`);
  if (!args.source || args.source === true) throw new GkError('Thiếu --source: trace lấy từ đâu (bản build, cảnh, cách ghi) — đó là bằng chứng của oracle');
  const confidence = args.confidence ?? 'observed';
  if (!['observed', 'derived', 'inferred'].includes(confidence)) throw new GkError('--confidence phải là observed, derived hoặc inferred');
  const tolerance = args.tolerance === undefined ? undefined : Number(args.tolerance);
  if (tolerance !== undefined && !(tolerance >= 0)) throw new GkError('--tolerance phải là số ≥ 0');
  if (confidence === 'inferred' && tolerance === undefined) throw new GkError('confidence inferred phải có --tolerance');
  const opts = { in: list(args.in), out: list(args.out), max: args.max ? Number(args.max) : DEFAULT_MAX, every: args.every ? Number(args.every) : undefined };
  if (!opts.in.length || !opts.out.length) throw new GkError('Cần --in <cột đầu vào> và --out <cột kết quả>');
  if (args.at) opts.at = parseAt(args.at);

  const tracePath = path.resolve(cwd, trace);
  if (!exists(tracePath)) throw new GkError(`Không có ${trace}`);
  const rows = parseTrace(fs.readFileSync(tracePath, 'utf8'), tracePath);
  const cases = buildCases(rows, opts);
  if (!cases.length) throw new GkError('Không lấy được case nào từ trace');
  const oracle = {
    $schema: '../../.gamekit/schemas/oracle.schema.json',
    source: String(args.source),
    confidence,
    ...(args.description ? { description: String(args.description) } : {}),
    ...(tolerance !== undefined ? { tolerance } : {}),
    cases,
  };
  const errs = check('oracle', oracle);
  if (errs.length) throw new GkError(`oracle không hợp lệ: ${errs.join('; ')}`);
  writeJson(to, oracle);
  log.ok(`${rel}: ${cases.length} case từ ${rows.length} dòng trace (${path.basename(tracePath)})`);
  log.info(`Tiếp: gắn vào nghĩa vụ trong spec/obligations.yaml (oracle: ${rel}, case "oracle") và viết test it.each — skill parity-check.`);
  if (exists(path.join(root, 'spec', 'obligations.yaml')) && !fs.readFileSync(path.join(root, 'spec', 'obligations.yaml'), 'utf8').includes(rel))
    log.warn(`Chưa nghĩa vụ nào trỏ tới ${rel}`);
  return 0;
}
