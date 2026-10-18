// gamekit questions — analysis questions per area (notes/<area>/questions.yaml): progress and what still blocks closing.
import { log } from './lib/log.mjs';
import { requireGameRoot } from './lib/game.mjs';
import { questionSummary } from './lib/notes.mjs';

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const rows = questionSummary(root).filter((r) => !args.area || r.area === args.area);
  if (args.json) {
    log.info(JSON.stringify(rows, null, 2));
    return 0;
  }
  if (!rows.length) {
    log.info(args.area ? `Không có notes/${args.area}/questions.yaml.` : 'Chưa có notes/<mảng>/questions.yaml nào (chia mảng bằng re-plan.yaml; không chia thì dùng notes/QUESTIONS.md).');
    return 0;
  }
  for (const r of rows) {
    const line = `${r.area}: ${r.answered}/${r.total} đã trả lời, ${r.partial} một phần, ${r.open} mở`;
    if (r.blocking.length) {
      log.warn(`${line} — ${r.blocking.length} câu bắt buộc chưa xong:`);
      for (const q of r.blocking) log.info(`    ${q.id} (${q.status}): ${q.question}`);
    } else log.ok(line);
  }
  return 0;
}
