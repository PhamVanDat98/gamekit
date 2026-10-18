// Analysis notes of a game: notes/<area>/questions.yaml (machine-readable questions) and the notes answering them.
import fs from 'node:fs';
import path from 'node:path';
import { exists, readYaml, walk } from './io.mjs';
import { check } from './schema.mjs';

const QUESTIONS_FILE = /^([a-z0-9][a-z0-9-]*)\/questions\.yaml$/;

/** The five parts every conclusion carries (skill re-notes). A part is a heading or a bold label. */
export const NOTE_PARTS = ['Kết luận', 'Vị trí', 'Độ tin cậy', 'Phạm vi đã tìm', 'Còn chưa biết'];
const CONFIDENCE = /\b(observed|derived|inferred)\b/;

/** Every notes/<area>/questions.yaml: { area, rel, data } or { area, rel, error } when the YAML does not parse. */
export function loadQuestionFiles(root) {
  const out = [];
  for (const rel of walk(path.join(root, 'notes'))) {
    const area = QUESTIONS_FILE.exec(rel)?.[1];
    if (!area) continue;
    const where = `notes/${rel}`;
    try {
      out.push({ area, rel: where, data: readYaml(path.join(root, where)) });
    } catch (e) {
      out.push({ area, rel: where, error: e.message });
    }
  }
  return out;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Parts of NOTE_PARTS a note lacks, plus 'confidence' when no observed|derived|inferred is written. */
export function missingNoteParts(text) {
  const missing = NOTE_PARTS.filter((p) => !new RegExp(`(^#{1,6}\\s*${escape(p)}|\\*\\*${escape(p)}\\*\\*)`, 'mi').test(text));
  if (!CONFIDENCE.test(text)) missing.push('độ tin cậy observed | derived | inferred');
  return missing;
}

const isOpen = (q) => q.status !== 'answered';
const isRequired = (q) => q.required !== false;

/**
 * Check every question file. Links (notes, params, obligations a question names) must exist at any stage.
 * Completeness binds from P2 (`strict`): an answered question cites a note with all five parts; a required
 * question still open says why (openReason) and what it costs the port (impact).
 */
export function checkQuestions(root, pr, { strict, paramKeys, obligationIds, areas }) {
  const flag = (where, msg) => (strict ? pr.error : pr.warn).call(pr, where, msg);
  const seen = new Map();
  const notesChecked = new Map();
  for (const f of loadQuestionFiles(root)) {
    const where = f.rel;
    if (f.error) {
      pr.error(where, f.error);
      continue;
    }
    const errs = check('questions', f.data);
    for (const e of errs) pr.error(where, e);
    if (errs.length) continue;
    if (areas && !areas.has(f.area)) pr.warn(where, `re-plan.yaml không có mảng ${f.area}`);
    for (const q of f.data.questions) {
      if (!q.id.startsWith(`${f.area}.`)) pr.error(where, `${q.id}: câu hỏi của mảng ${f.area} phải có id ${f.area}.<tên>`);
      if (seen.has(q.id)) pr.error(where, `trùng id câu hỏi ${q.id} (đã có trong ${seen.get(q.id)})`);
      else seen.set(q.id, where);
      for (const n of q.notes ?? []) {
        if (!exists(path.join(root, n))) {
          pr.error(where, `${q.id}: không có ghi chú ${n}`);
          continue;
        }
        if (!notesChecked.has(n)) notesChecked.set(n, missingNoteParts(fs.readFileSync(path.join(root, n), 'utf8')));
      }
      if (paramKeys) for (const k of q.params ?? []) if (!paramKeys.has(k)) pr.error(where, `${q.id}: params ${k} không có trong params/`);
      if (obligationIds) for (const o of q.obligations ?? []) if (!obligationIds.has(o)) pr.error(where, `${q.id}: không có nghĩa vụ ${o} trong spec/obligations`);
      if (q.status === 'answered' && !(q.notes ?? []).length) flag(where, `${q.id}: đã trả lời nhưng chưa trỏ tới ghi chú nào (notes)`);
      if (isOpen(q) && isRequired(q) && !(q.openReason && q.impact))
        flag(where, `${q.id}: câu bắt buộc còn ${q.status} — trả lời, hoặc ghi openReason và impact (ảnh hưởng tới bản port)`);
    }
  }
  for (const [n, missing] of notesChecked) if (missing.length) flag(n, `ghi chú thiếu: ${missing.join(', ')} (skill re-notes)`);
}

/** Per-area progress for `gamekit questions`. */
export function questionSummary(root) {
  return loadQuestionFiles(root)
    .filter((f) => !f.error && Array.isArray(f.data?.questions))
    .map((f) => {
      const qs = f.data.questions;
      const count = (s) => qs.filter((q) => q.status === s).length;
      return {
        area: f.area,
        file: f.rel,
        total: qs.length,
        answered: count('answered'),
        partial: count('partial'),
        open: count('open'),
        // Required questions still open without a recorded reason: what blocks closing the area.
        blocking: qs.filter((q) => isOpen(q) && isRequired(q) && !(q.openReason && q.impact)).map((q) => ({ id: q.id, status: q.status, question: q.question })),
      };
    });
}
