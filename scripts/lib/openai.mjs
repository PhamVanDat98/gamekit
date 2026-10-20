// OpenAI calls for asset generation (images, speech), with no SDK: fetch + retries.
// OPENAI_API_KEY is required; OPENAI_BASE_URL points elsewhere (a proxy, a compatible server, tests).
import { GkError } from './log.mjs';

const base = () => (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');

function key() {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new GkError('Thiếu OPENAI_API_KEY (biến môi trường). Không có key: dùng --dry-run để lấy prompt, sinh bằng công cụ khác (Codex, ChatGPT…) rồi `gamekit gen import`.');
  return k;
}

async function post(path, body, { tries = 3 } = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${base()}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key()}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res;
    const text = await res.text().catch(() => '');
    // Rate limits and server errors are worth another try; a bad request or a refused prompt is not.
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    let msg = text;
    try {
      msg = JSON.parse(text).error?.message ?? text;
    } catch {
      /* not JSON */
    }
    throw new GkError(`OpenAI ${path}: HTTP ${res.status} — ${msg.slice(0, 300)}`);
  }
}

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
