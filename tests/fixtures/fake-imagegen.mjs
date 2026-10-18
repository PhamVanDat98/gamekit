// Stands in for Codex in tests: reads the brief GameKit wrote, "draws" every file it lists.
// FAKE_ART=flat → one flat colour; FAKE_ART=opaque → no transparency; FAKE_ART=fail → exit 3 without drawing.
import fs from 'node:fs';
import { picturePng, solidPng } from '../helpers.mjs';

const brief = fs.readFileSync(process.env.GAMEKIT_ART_BRIEF, 'utf8');
const files = JSON.parse(brief.match(/```json\n([\s\S]*?)\n```/)[1]);
const mode = process.env.FAKE_ART ?? '';
if (mode === 'fail') process.exit(3);
for (const f of files) {
  // Concepts are drawn at a model size (short side 512+); assets at the exact spec size.
  const k = f.kind === 'concept' ? Math.max(1, 512 / Math.min(f.width, f.height)) : 1;
  const [w, h] = [Math.round(f.width * k), Math.round(f.height * k)];
  const png = mode === 'flat' ? solidPng(w, h) : picturePng(w, h, { alpha: f.alpha && mode !== 'opaque' });
  fs.writeFileSync(f.path, png);
  fs.writeFileSync(f.sidecar, JSON.stringify({ prompt: `test prompt for ${f.path}`, model: 'fake-image-1' }));
  console.log(`${f.path} — fake-image-1 — ok`);
}
