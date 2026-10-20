// OpenAI calls for asset generation (images, speech), with no SDK: fetch + retries.
// OPENAI_API_KEY is required; OPENAI_BASE_URL points elsewhere (a proxy, a compatible server, tests).
import { GkError } from './log.mjs';

const base = () => (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');

function key() {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new GkError('Thiếu OPENAI_API_KEY (biến môi trường). Không có key: dùng --dry-run để lấy prompt, sinh bằng công cụ khác (Codex, ChatGPT…) rồi `gamekit gen import`.');
  return k;
}

const TIMEOUT_MS = 5 * 60 * 1000; // a high-quality image can take minutes

async function post(path, body, { tries = 3 } = {}) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`${base()}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key()}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      if (e instanceof GkError) throw e;
      // Network down, DNS, proxy, timeout: worth another try, then a clear message.
      if (attempt < tries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new GkError(`OpenAI ${path}: không kết nối được (${e.cause?.code ?? e.name}: ${e.cause?.message ?? e.message}) — kiểm tra mạng/proxy, OPENAI_BASE_URL`);
    }
    if (res.ok) return res;
    const text = await res.text().catch(() => '');
    let err = {};
    try {
      err = JSON.parse(text).error ?? {};
    } catch {
      /* not JSON */
    }
    // Rate limits and server errors are worth another try; out of quota, a bad request or a refused prompt is not.
    const retry = (res.status === 429 && err.code !== 'insufficient_quota') || res.status >= 500;
    if (retry && attempt < tries) {
      const after = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 60) * 1000 : 1000 * 2 ** attempt);
      continue;
    }
    const msg = err.message ?? text;
    throw new GkError(`OpenAI ${path}: HTTP ${res.status}${err.code ? ` (${err.code})` : ''} — ${String(msg).slice(0, 300)}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Closest size the image models accept for a target aspect ratio. */
export function imageSizeFor(w, h) {
  const r = w / h;
  return r >= 1.25 ? '1536x1024' : r <= 0.8 ? '1024x1536' : '1024x1024';
}

/** PNG bytes for a prompt. */
export async function generateImage({ prompt, model, size, transparent, quality }) {
  const res = await post('/images/generations', {
    model,
    prompt,
    size,
    n: 1,
    quality: quality ?? 'auto',
    output_format: 'png',
    background: transparent ? 'transparent' : 'opaque',
  });
  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new GkError('OpenAI không trả về ảnh (data[0].b64_json)');
  return Buffer.from(b64, 'base64');
}

/** Audio bytes for a line of speech. `format`: mp3 | opus | aac | flac | wav. */
export async function generateSpeech({ input, model, voice, format, instructions }) {
  const res = await post('/audio/speech', { model, input, voice, response_format: format, ...(instructions ? { instructions } : {}) });
  return Buffer.from(await res.arrayBuffer());
}
