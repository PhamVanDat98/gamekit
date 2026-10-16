// gamekit config — answer portal questions later (missing settings, a newly added portal).
import { log } from './lib/log.mjs';
import { requireGameRoot, loadGame, updateGame } from './lib/game.mjs';
import { allQuestions, ask, parseSets, settingsFor } from './lib/questions.mjs';
import { applyPortalChecklists, loadPortal, missingSettings } from './lib/portals.mjs';

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const questions = allQuestions({ name: game.name, title: game.title }).filter((q) => q.portal);
  let portals = [...(game.portals ?? [])];
  if (args.portal) {
    for (const p of String(args.portal).split(',')) {
      loadPortal(p); // unknown portal → error listing the kits
      if (!portals.includes(p)) portals.push(p);
    }
  }
  const current = game.portalSettings ?? {};
  const isOpen = (q) => portals.includes(q.portal) && (current[q.portal]?.[q.key.slice(q.portal.length + 1)] ?? null) === null;
  if (args.questions) {
    log.info(JSON.stringify(questions.filter(isOpen), null, 2));
    return 0;
  }
  const preset = parseSets(args.set, questions);
  const toAsk = process.stdin.isTTY && !args['no-input'] ? questions.filter((q) => isOpen(q) && !(q.key in preset)) : [];
  const answers = { ...preset, ...(toAsk.length ? await ask(toAsk, { preset: { portals } }) : {}) };
  const portalSettings = settingsFor(portals, answers, questions, current);
  updateGame(root, [
    [['portals'], portals],
    [['portalSettings'], portalSettings],
  ]);
  applyPortalChecklists(root, portals);
  let open = 0;
  for (const p of portals) {
    const miss = missingSettings(loadPortal(p), portalSettings[p]);
    open += miss.length;
    if (miss.length) log.warn(`Portal ${p} còn thiếu: ${miss.join(', ')}`);
  }
  if (!open) log.ok('Thông tin portal đã đủ');
  return 0;
}
