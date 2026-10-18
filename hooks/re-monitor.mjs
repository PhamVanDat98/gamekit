#!/usr/bin/env node
// PostToolUse. Records RE tool calls (REA MCP tools, RE command-line tools) in the game's RE journal
// (notes/re-log.jsonl), so `gamekit re --watch` shows the investigation as it happens, and reminds the
// agent when a step has no question, repeats an earlier analysis or came back incomplete.
// Outside a game folder, or for any other tool call, it does nothing. Never fails or blocks the session.
import fs from 'node:fs';
import path from 'node:path';

function findGameRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'game.yaml'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

let out = '';
try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  const lib = await import('../scripts/lib/relog.mjs');
  const entry = lib.entryFromToolUse(input);
  const root = entry && findGameRoot(input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd());
  if (root) {
    let game = {};
    try {
      game = (await import('../scripts/lib/game.mjs')).loadGame(root);
    } catch {
      /* a broken game.yaml must not stop the journal */
    }
    const prior = lib.readLog(root).entries.filter((e) => e.key === entry.key);
    const q = lib.readFocus(root)?.q;
    const at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    lib.appendEntry(root, lib.compact({ at, phase: game.phase, q, ...entry }));

    const notes = [];
    if (!q) notes.push('bước này chưa gắn câu hỏi — chạy `gamekit re focus Q#` (câu trong notes/QUESTIONS.md) trước khi phân tích tiếp');
    if (prior.length) {
      const p = prior.at(-1);
      notes.push(`phân tích y hệt đã chạy ${prior.length} lần (lần cuối ${p.at}${p.q ? `, ${p.q}` : ''}) — đọc lại kết quả hoặc notes/ thay vì chạy lại`);
    }
    if (entry.limits?.length) notes.push(`kết quả chưa đầy đủ (${entry.limits.join(', ')}) — không kết luận "không có" từ kết quả này`);
    if (entry.runtime && game.source?.ownership === 'third-party')
      notes.push('game làm lại của người khác: chỉ được phân tích file tĩnh, không chạy hay gắn vào game gốc');
    if (notes.length) out = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `<gamekit-re>${notes.join(' · ')}</gamekit-re>` } });
  }
} catch {
  /* never break the session */
}
if (out) process.stdout.write(out);
