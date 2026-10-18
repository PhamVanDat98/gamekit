// gamekit art brief|gen|check|board|lock — raster concepts and assets drawn by an image agent (Codex by
// default), checked here, then reviewed by eye. The user locks one style; assets follow that style.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { exists, readJson } from './lib/io.mjs';
import { log, GkError, Problems } from './lib/log.mjs';
import { requireGameRoot, loadGame, updateGame, nowIso } from './lib/game.mjs';
import { escapeHtml } from './lib/html.mjs';
import { imageInfo, pngPixels, pixelStats } from './lib/png.mjs';
import { STYLES_FILE, loadStyles, checkStyles, forbiddenHits, decisionIds } from './validate.mjs';
import { addEntries } from './provenance.mjs';

export const CONCEPT_DIR = 'art/concepts';
export const RAW_DIR = 'art/raw'; // model output before resizing — gitignored
export const PROMPT_DIR = 'art/prompts'; // prompt + model of each asset — committed
const LOG_DIR = '.gamekit/local/art';
export const DEFAULT_COMMAND = ['codex', 'exec', '--full-auto', '--skip-git-repo-check', '{prompt}'];
const IMAGE_KINDS = ['sprite', 'ui', 'anim', 'background', 'tile', 'icon', 'texture'];
// Kinds whose edges should be see-through when alpha is asked for (a button or panel may fill its edges).
const CUTOUT_KINDS = ['concept', 'sprite', 'anim', 'icon'];
// Kinds that may legitimately be one flat colour over most of the picture.
const FLAT_OK_KINDS = ['ui', 'tile', 'texture'];
const MIN_CONCEPT_SIDE = 512;

/** --style a,b --style c → ['a', 'b', 'c'] */
const list = (v) => [].concat(v ?? []).flatMap((s) => String(s).split(',')).map((s) => s.trim()).filter(Boolean);

function requireStyles(root, game) {
  let styles;
  try {
    styles = loadStyles(root);
  } catch (e) {
    throw new GkError(e.message);
  }
  if (!styles) throw new GkError(`Chưa có ${STYLES_FILE} — dùng skill style-direction để đề xuất các hướng style trước.`);
  const pr = checkStyles(styles, game);
  if (!pr.ok) {
    pr.report(STYLES_FILE);
    throw new GkError(`${STYLES_FILE} không hợp lệ`);
  }
  return styles;
}

function pickStyles(styles, wanted) {
  if (!wanted.length) return styles.styles;
  const unknown = wanted.filter((id) => !styles.styles.some((s) => s.id === id));
  if (unknown.length) throw new GkError(`Không có style ${unknown.join(', ')} trong ${STYLES_FILE} (có: ${styles.styles.map((s) => s.id).join(', ')})`);
  return styles.styles.filter((s) => wanted.includes(s.id));
}

// ---------- jobs: one brief + one image-agent run each ----------

function conceptJobs(styles, picked, only) {
  const concepts = only.length ? styles.concepts.filter((c) => only.includes(c.id)) : styles.concepts;
  if (only.length && concepts.length !== only.length)
    throw new GkError(`Không có concept ${only.filter((id) => !concepts.some((c) => c.id === id)).join(', ')} (có: ${styles.concepts.map((c) => c.id).join(', ')})`);
  return picked.map((style) => {
    const dir = `${CONCEPT_DIR}/${style.id}`;
    return {
      id: `concept-${style.id}`,
      kind: 'concept',
      style,
      dir,
      brief: `${dir}/BRIEF.md`,
      files: concepts.map((c) => ({
        id: c.id,
        path: `${dir}/${c.id}.png`,
        sidecar: `${dir}/${c.id}.json`,
        kind: 'concept',
        width: c.size[0],
        height: c.size[1],
        alpha: c.alpha === true,
        brief: c.brief,
      })),
    };
  });
}

function loadManifest(root) {
  const f = path.join(root, 'asset-manifest.json');
  if (!exists(f)) throw new GkError('Chưa có asset-manifest.json — lập spec asset (asset-spec) trước khi sinh asset.');
  return readJson(f);
}

function assetJobs(root, game, styles, only, batch) {
  const lockedId = game.art?.style;
  if (!lockedId) throw new GkError('Chưa chốt style. Người dùng chọn từ bảng concept, rồi `gamekit art lock <style>`.');
  const style = styles.styles.find((s) => s.id === lockedId);
  if (!style) throw new GkError(`art.style = ${lockedId} không có trong ${STYLES_FILE}`);
  const man = loadManifest(root);
  let assets = (man.assets ?? []).filter((a) => a.make === 'image-gen');
  if (only.length) {
    const missing = only.filter((id) => !assets.some((a) => a.id === id));
    if (missing.length) throw new GkError(`Không có asset image-gen ${missing.join(', ')} trong asset-manifest.json`);
    assets = assets.filter((a) => only.includes(a.id));
  }
  if (!assets.length) throw new GkError('asset-manifest.json không có asset nào `make: "image-gen"`.');
  const pr = new Problems();
  for (const a of assets) {
    if (!IMAGE_KINDS.includes(a.kind)) pr.error('asset-manifest.json', `${a.id}: kind ${a.kind} không vẽ bằng image-gen được`);
    if (!/\.(png|webp)$/i.test(a.path)) pr.error('asset-manifest.json', `${a.id}: ${a.path} — image-gen chỉ ra PNG hoặc WebP`);
    for (const t of forbiddenHits(game, `${a.id} ${a.brief ?? ''}`)) pr.error('asset-manifest.json', `${a.id}: brief nhắc "${t}" của game gốc`);
  }
  if (!pr.ok) {
    pr.report('asset-manifest.json');
    throw new GkError('Sửa asset-manifest.json trước khi sinh ảnh');
  }
  const concepts = styles.concepts.map((c) => `${CONCEPT_DIR}/${style.id}/${c.id}.png`).filter((p) => exists(path.join(root, p)));
  const jobs = [];
  for (let i = 0; i < assets.length; i += batch) {
    const n = jobs.length + 1;
    jobs.push({
      id: `assets-${n}`,
      kind: 'assets',
      style,
      concepts,
      dir: RAW_DIR,
      brief: `${RAW_DIR}/BRIEF-${n}.md`,
      files: assets.slice(i, i + batch).map((a) => ({
        id: a.id,
        path: a.path,
        sidecar: `${PROMPT_DIR}/${a.id}.json`,
        kind: a.kind,
        width: a.frames ? a.frames.width * a.frames.count : a.width,
        height: a.height,
        alpha: a.alpha === true,
        brief: a.brief ?? '',
        spec: a,
      })),
    });
  }
  return jobs;
}

// ---------- briefs ----------

function styleSection(style) {
  return [
    `## Style: ${style.name} (\`${style.id}\`)`,
    style.pitch,
    '',
    `**Style lock** — đặt nguyên văn ở đầu mọi prompt ảnh:`,
    '',
    '```',
    style.lock,
    '```',
    style.palette?.length ? `\n**Bảng màu:** ${style.palette.join(' · ')}` : null,
    style.ui ? `\n**Hướng UI và bố cục:** ${style.ui}` : null,
    style.avoid?.length ? `\n**Tránh:** ${style.avoid.join('; ')}` : null,
    style.refs?.length ? `\n**Tham khảo (bằng lời):** ${style.refs.join('; ')}` : null,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const fileRow = (f) => {
  const g = gcd(f.width, f.height);
  const size = f.kind === 'concept' ? `tỉ lệ ${f.width / g}:${f.height / g}, cạnh ngắn ≥ ${MIN_CONCEPT_SIDE}px` : `đúng ${f.width}×${f.height}px`;
  return `| \`${f.path}\` | ${size} | ${f.alpha ? 'trong suốt' : 'không'} | ${f.brief.replace(/\|/g, '/').replace(/\n/g, ' ')} |`;
};

function assetDetails(f) {
  const a = f.spec;
  const extra = [];
  if (a.frames) extra.push(`sprite sheet ${a.frames.count} khung ${a.frames.width}×${a.frames.height} xếp ngang, ${a.frames.fps} fps`);
  if (a.nineSlice) extra.push(`9-slice [trái, trên, phải, dưới] = [${a.nineSlice.join(', ')}] — viền giữ nguyên, phần giữa kéo giãn được`);
  if (a.pivot) extra.push(`pivot [${a.pivot.join(', ')}]`);
  if (a.padding != null) extra.push(`chừa ${a.padding}px trong suốt quanh hình`);
  if (a.seamless) extra.push('lặp liền mạch (tile/texture nối không thấy mép)');
  if (a.states?.length) extra.push(`trạng thái: ${a.states.join(', ')}`);
  if (a.minDisplayPx) extra.push(`hiển thị nhỏ nhất ${a.minDisplayPx}px — hình khối rõ, ít chi tiết vụn`);
  if (a.noText !== false) extra.push('không có chữ, số hay ký tự trong ảnh');
  return extra.length ? `- \`${a.id}\`: ${extra.join('; ')}` : null;
}

export function briefText(job, game, note) {
  const filesJson = JSON.stringify(
    job.files.map((f) => ({ path: f.path, sidecar: f.sidecar, width: f.width, height: f.height, alpha: f.alpha, kind: f.kind })),
    null,
    2,
  );
  const isConcept = job.kind === 'concept';
  const lines = [
    isConcept ? `# Brief concept: ${job.style.name} — ${game.title}` : `# Brief asset (${job.id}): ${game.title} — style ${job.style.name}`,
    '',
    isConcept
      ? 'Bạn vẽ ảnh concept raster cho **một hướng style** để người dùng so và chọn. GameKit và Claude Code sẽ kiểm tra kết quả, ảnh sai sẽ bị yêu cầu vẽ lại.'
      : 'Bạn vẽ asset raster cho bản phát hành, theo style người dùng đã chốt. GameKit kiểm tra kích thước, nền trong suốt, prompt; Claude Code xem từng ảnh.',
    '',
    styleSection(job.style),
    '',
  ];
  if (!isConcept && job.concepts.length)
    lines.push('## Ảnh mẫu style', 'Concept đã được chọn — dùng làm ảnh tham chiếu (image input) nếu công cụ cho phép, để màu, nét, ánh sáng khớp:', ...job.concepts.map((c) => `- \`${c}\``), '');
  lines.push('## Ảnh cần vẽ', '', '| File | Kích thước | Nền | Nội dung |', '| --- | --- | --- | --- |', ...job.files.map(fileRow), '');
  if (!isConcept) {
    const details = job.files.map(assetDetails).filter(Boolean);
    if (details.length) lines.push('Spec kỹ thuật:', ...details, '');
  }
  if (note) lines.push('## Góp ý cho lần vẽ lại', note, '');
  lines.push(
    '## Cách làm',
    '- Dùng **công cụ tạo ảnh** (image generation) của bạn. Không vẽ hình bằng code (SVG, canvas, PIL vẽ hình khối) — cần ảnh raster do model ảnh sinh ra.',
    '- Mỗi ảnh một prompt; prompt **bắt đầu bằng style lock**, sau đó là nội dung. Viết prompt bằng tiếng Anh.',
    '- Nền trong suốt nghĩa là kênh alpha thật (PNG RGBA, mép ảnh trong suốt). Không vẽ nền ca-rô giả trong suốt, không nền trắng.',
  );
  if (isConcept) lines.push(`- Lưu PNG đúng đường dẫn. Tỉ lệ khung đúng như bảng (lệch ≤ 2%), cạnh ngắn ≥ ${MIN_CONCEPT_SIDE}px.`);
  else
    lines.push(
      `- Ảnh gốc từ model lưu ở \`${RAW_DIR}/<id>.png\`. Sau đó hậu xử lý ra file cuối đúng kích thước trong bảng: thu nhỏ giữ tỉ lệ, cắt viền trong suốt thừa, căn giữa, thêm padding. Dùng công cụ có sẵn (ImageMagick, Python Pillow, sharp) — chỉ để đổi cỡ/cắt/ghép khung, không để vẽ.`,
      '- Sprite sheet: vẽ từng khung (hoặc một ảnh nhiều tư thế) rồi ghép ngang đúng kích thước khung.',
    );
  lines.push(
    '- Mỗi ảnh ghi một file JSON (`sidecar` trong danh sách file cuối brief): `{ "prompt": "<prompt đầy đủ đã dùng>", "model": "<tên model ảnh>" }`.',
    '- Không mở thư mục `reference/`, không dùng ảnh, tên hay nhân vật của game gốc. Thiết kế là mới.',
    `- Chỉ ghi các file trong bảng, file JSON đi kèm${isConcept ? '' : ` và \`${RAW_DIR}/\``}. Không sửa file nào khác, không commit.`,
    '- Không làm được ảnh nào (công cụ ảnh không có, hết hạn mức…): ghi rõ lý do vào câu trả lời, không thay bằng ảnh tự vẽ.',
    '- Xong: trả lời mỗi ảnh một dòng `file — model — ok/lỗi`.',
    '',
    '## Danh sách file (máy đọc)',
    '```json',
    filesJson,
    '```',
    '',
  );
  return lines.join('\n');
}

function writeBriefs(root, game, jobs, note) {
  for (const job of jobs) {
    // Create every folder the agent writes to, so a sandboxed agent never has to.
    for (const d of new Set([job.dir, ...job.files.flatMap((f) => [path.dirname(f.path), path.dirname(f.sidecar)])])) fs.mkdirSync(path.join(root, d), { recursive: true });
    fs.writeFileSync(path.join(root, job.brief), briefText(job, game, note));
  }
}

// ---------- checks: what a script can tell without looking ----------

/** Problems with one generated image (empty = passes the mechanical check; still needs a look). */
export function checkImage(root, f) {
  const errs = [];
  const abs = path.join(root, f.path);
  if (!exists(abs)) return [`chưa có ${f.path}`];
  const info = imageInfo(abs);
  if (!info) return [`${f.path} không phải PNG/WebP hợp lệ`];
  if (f.kind === 'concept') {
    const want = f.width / f.height;
    const got = info.width / info.height;
    if (Math.abs(got - want) / want > 0.02) errs.push(`tỉ lệ ${info.width}×${info.height}, cần ${f.width}:${f.height}`);
    if (Math.min(info.width, info.height) < MIN_CONCEPT_SIDE) errs.push(`${info.width}×${info.height} quá nhỏ (cạnh ngắn < ${MIN_CONCEPT_SIDE}px)`);
  } else if (info.width !== f.width || info.height !== f.height) errs.push(`${info.width}×${info.height}, spec cần ${f.width}×${f.height}`);
  if (f.alpha && info.alpha === false) errs.push('cần nền trong suốt nhưng ảnh không có kênh alpha');
  const px = info.format === 'png' ? pngPixels(abs) : null;
  if (px) {
    const st = pixelStats(px);
    if (st.visible < 0.01) errs.push('ảnh gần như trong suốt hoàn toàn');
    else if (!FLAT_OK_KINDS.includes(f.kind) && st.flat > 0.97) errs.push('ảnh gần như một màu — không giống ảnh do model sinh ra');
    if (f.alpha && CUTOUT_KINDS.includes(f.kind) && st.clearBorder < 0.9)
      errs.push(`mép ảnh chỉ ${Math.round(st.clearBorder * 100)}% trong suốt — nền giả (ca-rô, trắng) hoặc hình bị cắt sát mép`);
  }
  const side = path.join(root, f.sidecar);
  if (!exists(side)) errs.push(`thiếu ${f.sidecar} (prompt và model đã dùng)`);
  else {
    try {
      const meta = readJson(side);
      if (typeof meta.prompt !== 'string' || meta.prompt.length < 10) errs.push(`${f.sidecar}: thiếu "prompt"`);
      if (typeof meta.model !== 'string' || !meta.model) errs.push(`${f.sidecar}: thiếu "model"`);
    } catch (e) {
      errs.push(e.message);
    }
  }
  return errs;
}

function reportChecks(root, jobs) {
  let bad = 0;
  const results = new Map();
  for (const job of jobs) {
    for (const f of job.files) {
      const errs = checkImage(root, f);
      results.set(f.path, errs);
      if (errs.length) {
        bad++;
        log.fail(`${f.path}: ${errs.join('; ')}`);
      } else log.ok(f.path);
    }
  }
  return { bad, results };
}

// ---------- running the image agent ----------

function commandFor(game, prompt) {
  const cmd = game.art?.command ?? DEFAULT_COMMAND;
  const hasSlot = cmd.some((a) => a.includes('{prompt}'));
  const argv = cmd.map((a) => a.replaceAll('{prompt}', prompt));
  return hasSlot ? argv : [...argv, prompt];
}

function runJob(root, game, job, timeoutMin) {
  const logRel = `${LOG_DIR}/${job.id}.log`;
  fs.mkdirSync(path.join(root, LOG_DIR), { recursive: true });
  const out = fs.openSync(path.join(root, logRel), 'w');
  const argv = commandFor(game, `Đọc ${job.brief} và làm theo. Chỉ ghi những file brief cho phép.`);
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fs.closeSync(out);
      resolve({ ...r, log: logRel });
    };
    // Windows needs a shell to run codex.cmd; the shell splits on spaces, so quote each argument.
    const win = process.platform === 'win32';
    const args = win ? argv.slice(1).map((a) => `"${a.replace(/"/g, '\\"')}"`) : argv.slice(1);
    const child = spawn(argv[0], args, {
      cwd: root,
      stdio: ['ignore', out, out],
      env: { ...process.env, GAMEKIT_ART_BRIEF: job.brief },
      shell: win,
    });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({ code: null, error: `quá ${timeoutMin} phút` });
    }, timeoutMin * 60e3);
    child.on('error', (e) =>
      finish({
        code: null,
        error: e.code === 'ENOENT' ? `không tìm thấy lệnh "${argv[0]}" — cài Codex CLI (npm i -g @openai/codex, rồi codex login) hoặc đặt art.command trong game.yaml` : e.message,
      }),
    );
    child.on('close', (code) => finish({ code }));
  });
}

async function pool(items, n, fn) {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return results;
}

/** Label the generated assets that passed the check: provenance `generated`, source = model, note = prompt. */
function labelAssets(root, jobs, results) {
  const entries = [];
  for (const f of jobs.flatMap((j) => j.files)) {
    if (results.get(f.path)?.length) continue;
    const meta = readJson(path.join(root, f.sidecar));
    entries.push({ path: f.path, label: 'generated', source: `${meta.model} (gamekit art gen)`, license: null, note: meta.prompt.slice(0, 500) });
  }
  if (entries.length) addEntries(root, entries);
  return entries.length;
}

// ---------- board: every style's concepts side by side ----------

function boardHtml(root, game, styles) {
  const locked = game.art?.style;
  const cell = (style, c) => {
    const f = conceptJobs(styles, [style], [c.id])[0].files[0];
    const errs = checkImage(root, f);
    const src = `${style.id}/${c.id}.png`;
    const img = exists(path.join(root, f.path)) ? `<a href="${escapeHtml(src)}"><img src="${escapeHtml(src)}" alt="${escapeHtml(`${style.name} — ${c.id}`)}" loading="lazy"></a>` : '<div class="empty">chưa có ảnh</div>';
    const status = errs.length ? `<p class="bad">✘ ${errs.map(escapeHtml).join('<br>')}</p>` : '<p class="good">✔ đạt kiểm tra tự động</p>';
    return `<td class="${c.alpha ? 'alpha' : ''}">${img}${status}</td>`;
  };
  const head = styles.styles
    .map((s) => {
      const review = path.join(root, CONCEPT_DIR, s.id, 'REVIEW.md');
      const swatches = (s.palette ?? []).map((p) => `<span class="sw" style="background:${escapeHtml(p)}" title="${escapeHtml(p)}"></span>`).join('');
      return `<th${s.id === locked ? ' class="locked"' : ''}>
        <h2>${escapeHtml(s.name)} <code>${escapeHtml(s.id)}</code>${s.id === locked ? ' <span class="tag">đã chốt</span>' : ''}</h2>
        <p>${escapeHtml(s.pitch)}</p>
        ${swatches ? `<div class="pal">${swatches}</div>` : ''}
        ${s.ui ? `<p class="ui"><b>UI:</b> ${escapeHtml(s.ui)}</p>` : ''}
        ${exists(review) ? `<details><summary>Nhận xét của agent</summary><pre>${escapeHtml(fs.readFileSync(review, 'utf8'))}</pre></details>` : '<p class="muted">Chưa có nhận xét (REVIEW.md)</p>'}
      </th>`;
    })
    .join('');
  const rows = styles.concepts.map((c) => `<tr><th class="row"><b>${escapeHtml(c.id)}</b><p>${escapeHtml(c.brief)}</p></th>${styles.styles.map((s) => cell(s, c)).join('')}</tr>`).join('\n');
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chọn style — ${escapeHtml(game.title)}</title>
<style>
  :root { --bg: #f6f5f2; --fg: #1d1d1b; --muted: #6b6a66; --line: #dddad3; --card: #fff; --good: #1f7a3a; --bad: #b3261e; --accent: #2f5bd3; }
  @media (prefers-color-scheme: dark) { :root { --bg: #161615; --fg: #ecebe7; --muted: #9b9a95; --line: #34332f; --card: #1f1f1d; --good: #6ccf8a; --bad: #ff8a80; --accent: #8fb0ff; } }
  body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.45 system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .wrap { overflow-x: auto; }
  table { border-collapse: separate; border-spacing: 8px; }
  th, td { vertical-align: top; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px; text-align: left; min-width: 260px; max-width: 360px; }
  th { font-weight: normal; }
  th.row { min-width: 160px; max-width: 200px; }
  th.locked { outline: 2px solid var(--accent); }
  h2 { font-size: 15px; margin: 0 0 6px; }
  code { font-size: 12px; color: var(--muted); }
  .tag { background: var(--accent); color: var(--card); border-radius: 4px; padding: 1px 6px; font-size: 11px; }
  .pal { display: flex; gap: 4px; margin: 6px 0; }
  .sw { width: 22px; height: 22px; border-radius: 4px; border: 1px solid var(--line); }
  img { display: block; width: 100%; height: auto; border-radius: 6px; }
  td.alpha img { background: repeating-conic-gradient(#cfcfcf 0 25%, #f2f2f2 0 50%) 0 0 / 16px 16px; }
  .empty { aspect-ratio: 1; display: grid; place-items: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 6px; }
  .good { color: var(--good); margin: 6px 0 0; } .bad { color: var(--bad); margin: 6px 0 0; } .muted { color: var(--muted); }
  pre { white-space: pre-wrap; font: 12px/1.4 ui-monospace, monospace; }
</style>
</head>
<body>
<h1>Chọn style — ${escapeHtml(game.title)}</h1>
<p class="muted">Mỗi cột là một hướng style, mỗi hàng là cùng một nội dung. Bấm ảnh để xem cỡ thật. Chọn xong, báo agent để chốt (<code>gamekit art lock &lt;style&gt;</code>).</p>
<div class="wrap"><table>
<tr><th class="row"></th>${head}</tr>
${rows}
</table></div>
</body>
</html>
`;
}

function writeBoard(root, game, styles) {
  const file = path.join(root, CONCEPT_DIR, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, boardHtml(root, game, styles));
  return file;
}

// ---------- lock: the user's pick becomes the game's style ----------

function lock(root, game, styles, id) {
  const style = styles.styles.find((s) => s.id === id);
  if (!style) throw new GkError(`Không có style ${id} trong ${STYLES_FILE} (có: ${styles.styles.map((s) => s.id).join(', ')})`);
  const job = conceptJobs(styles, [style], [])[0];
  const bad = job.files.map((f) => [f.path, checkImage(root, f)]).filter(([, e]) => e.length);
  if (bad.length) {
    for (const [p, e] of bad) log.fail(`${p}: ${e.join('; ')}`);
    throw new GkError(`Concept của ${id} chưa đủ hoặc chưa đạt kiểm tra — vẽ lại (gamekit art gen --style ${id}) trước khi chốt.`);
  }
  if (game.art?.style === id) {
    log.ok(`Style ${id} đã được chốt từ trước`);
    return;
  }
  if (game.art?.style) log.warn(`Đổi style đã chốt ${game.art.style} → ${id}. Asset đã sinh theo style cũ cần vẽ lại.`);
  const at = nowIso();
  updateGame(root, [
    [['art', 'style'], id],
    [['art', 'lockedAt'], at],
  ]);
  const used = [...decisionIds(root)].map((d) => Number(d.slice(2)));
  const n = (used.length ? Math.max(...used) : 0) + 1;
  const entry = [
    '',
    `## D-${n} Chốt style art: ${style.name} (\`${id}\`)`,
    `- Ngày: ${at.slice(0, 10)}`,
    `- Bối cảnh: chọn từ ${styles.styles.length} hướng style, concept trong \`${CONCEPT_DIR}/\` (bảng so: \`${CONCEPT_DIR}/index.html\`)`,
    `- Quyết định: ${style.pitch}`,
    `- Style lock: \`${style.lock.replace(/`/g, "'")}\``,
    style.ui ? `- Bố cục UI: ${style.ui}` : null,
    '- Sai khác game gốc: đồ hoạ và bố cục UI làm mới; số liệu và logic gameplay giữ nguyên',
    '- Duyệt: người dùng chọn từ bảng concept',
    '',
  ].filter((l) => l !== null);
  fs.appendFileSync(path.join(root, 'DECISIONS.md'), entry.join('\n'));
  log.ok(`Đã chốt style ${style.name} (${id}) — game.yaml art.style, DECISIONS.md D-${n}`);
}

// ---------- entry ----------

const USAGE = `Dùng:
  gamekit art brief [--style a,b] [--assets] [--only id,…] [--note "…"]   Viết brief cho bên vẽ ảnh
  gamekit art gen [--style a,b] [--assets] [--only id,…] [--note "…"] [--jobs N] [--batch N] [--timeout phút] [--dry-run]
                                                    Viết brief, chạy bên vẽ ảnh (mặc định Codex) song song, kiểm tra kết quả
  gamekit art check [--style a,b] [--assets]        Kiểm tra ảnh đã sinh (kích thước, nền trong suốt, prompt)
  gamekit art board                                 Bảng so concept: ${CONCEPT_DIR}/index.html
  gamekit art lock <style>                          Chốt style người dùng chọn`;

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const [sub, ...rest] = args._;
  if (!sub || !['brief', 'gen', 'check', 'board', 'lock'].includes(sub)) throw new GkError(USAGE);
  const styles = requireStyles(root, game);

  if (sub === 'board') {
    const file = writeBoard(root, game, styles);
    log.ok(`Bảng so concept: ${path.relative(root, file)}`);
    log.info(`Mở trong trình duyệt: file://${file.split(path.sep).join('/')}`);
    return 0;
  }
  if (sub === 'lock') {
    if (!rest[0]) throw new GkError('Dùng: gamekit art lock <style>');
    lock(root, game, styles, rest[0]);
    writeBoard(root, loadGame(root), styles);
    return 0;
  }

  const only = list(args.only);
  const jobs = args.assets
    ? assetJobs(root, game, styles, only, Math.max(1, Number(args.batch) || 6))
    : conceptJobs(styles, pickStyles(styles, list(args.style)), only);
  const note = typeof args.note === 'string' ? args.note : null;

  if (sub === 'check') {
    const { bad } = reportChecks(root, jobs);
    if (!args.assets) writeBoard(root, game, styles);
    log.info(bad ? `\n${bad} ảnh chưa đạt.` : '\nMọi ảnh đạt kiểm tra tự động. Vẫn cần xem bằng mắt từng ảnh.');
    return bad ? 1 : 0;
  }

  writeBriefs(root, game, jobs, note);
  for (const j of jobs) log.ok(`Brief: ${j.brief} (${j.files.length} ảnh)`);
  if (sub === 'brief') return 0;

  if (args['dry-run']) {
    for (const j of jobs) log.info(`  ${commandFor(game, `Đọc ${j.brief} và làm theo. Chỉ ghi những file brief cho phép.`).join(' ')}`);
    return 0;
  }
  const n = Math.max(1, Number(args.jobs) || 3);
  const timeout = Math.max(1, Number(args.timeout) || 30);
  log.info(`\nChạy ${jobs.length} việc vẽ, ${Math.min(n, jobs.length)} cùng lúc (log: ${LOG_DIR}/)…`);
  const runs = await pool(jobs, n, async (j) => {
    const r = await runJob(root, game, j, timeout);
    (r.code === 0 ? log.ok : log.fail)(`${j.id}: ${r.code === 0 ? 'xong' : r.error ?? `thoát mã ${r.code}`} — log ${r.log}`);
    return r;
  });
  if (runs.every((r) => r.error && /không tìm thấy lệnh/.test(r.error))) throw new GkError(runs[0].error);

  log.info('\nKiểm tra kết quả:');
  const { bad, results } = reportChecks(root, jobs);
  if (args.assets) {
    const labeled = labelAssets(root, jobs, results);
    if (labeled) log.ok(`Gắn nhãn generated cho ${labeled} asset (provenance.json)`);
  } else log.ok(`Bảng so concept: ${path.relative(root, writeBoard(root, game, styles))}`);
  if (bad) {
    log.info(`\n${bad} ảnh chưa đạt. Xem log, rồi vẽ lại: gamekit art gen ${args.assets ? '--assets' : '--style <id>'} --only <id> --note "<góp ý>"`);
    return 1;
  }
  log.info(
    args.assets
      ? '\nMọi asset đạt kiểm tra tự động. Xem từng ảnh với concept đã chốt trước khi dùng (skill replace-graphics).'
      : '\nMọi concept đạt kiểm tra tự động. Xem từng ảnh, ghi REVIEW.md cho mỗi style, rồi đưa bảng so cho người dùng chọn (skill style-preview).',
  );
  return 0;
}
