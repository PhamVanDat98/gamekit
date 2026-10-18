// Project questions asked by `init` and `config`: GameKit's own plus each portal kit's settings.
// Answered three ways: on a terminal, as --set key=value (agents), or left empty and asked later.
import readline from 'node:readline';
import { GkError } from './log.mjs';
import { checkSetting, listPortals, loadPortal } from './portals.mjs';

export const ENGINES = [
  'unknown', 'unity', 'unreal', 'godot', 'cocos', 'flash', 'construct', 'laya', 'egret', 'playcanvas', 'html5', 'gamemaker', 'rpgmaker', 'renpy', 'defold', 'love2d', 'monogame', 'libgdx', 'openfl', 'solar2d', 'flutter', 'react-native', 'android-native', 'ios-native', 'native', 'other',
];
export const LANGUAGE_NAMES = {
  en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', it: 'Italiano', pt: 'Português', 'pt-br': 'Português (Brasil)',
  ru: 'Русский', tr: 'Türkçe', pl: 'Polski', vi: 'Tiếng Việt', id: 'Bahasa Indonesia', th: 'ไทย', ja: '日本語', ko: '한국어',
  'zh-hans': '简体中文', 'zh-hant': '繁體中文', ar: 'العربية', fa: 'فارسی', hi: 'हिन्दी',
};
const LANG_PATTERN = '^[a-z]{2,3}(-[a-z0-9]{2,8})*$';

const CORE_QUESTIONS = () => [
  { key: 'title', label: 'Tên game', description: 'Tên hiển thị của bản web. Game của bạn: giữ tên gốc được. Làm lại game người khác (init --third-party): phải đặt tên mới.', default: '{{TITLE}}', required: true },
  { key: 'engine', label: 'Engine của game gốc', description: `Engine game gốc dùng, để GameKit gợi ý skill phân tích. Chưa biết thì để unknown: \`gamekit recon --write\` sẽ nhận diện từ bản build. Một trong: ${ENGINES.join(', ')}.`, default: 'unknown', required: true, enum: ENGINES },
  { key: 'sourcePath', label: 'Đường dẫn game gốc', description: 'Thư mục bản game gốc trên máy — chỉ để phân tích, không bao giờ đóng gói. Để trống nếu chưa có.', required: false },
  { key: 'portals', label: 'Portal phát hành', description: `Các portal sẽ phát hành, cách nhau dấu phẩy. Có: ${listPortals().filter((p) => p !== 'dev-mock').join(', ')}. dev-mock luôn có sẵn để chạy thử.`, default: 'azgames', type: 'list', required: true },
  { key: 'language', label: 'Ngôn ngữ mặc định', description: 'Ngôn ngữ cho người chơi mới khi không đoán được từ trình duyệt. Mã BCP 47 viết thường (en, es, pt-br) — phải có file Language/<mã>.json.', default: 'en', required: true, pattern: LANG_PATTERN },
  { key: 'languages', label: 'Các ngôn ngữ hỗ trợ', description: 'Mã ngôn ngữ cách nhau dấu phẩy. en luôn có (bản gốc của mọi bản dịch). Mỗi mã một file Language/<mã>.json; người chơi chỉ tải một file.', default: 'en', type: 'list', required: true, pattern: LANG_PATTERN },
];

/** Every question for a game; portal questions carry `portal` so only the chosen portals are asked. */
export function allQuestions({ name, title }) {
  const fill = (v) => (typeof v === 'string' ? v.replaceAll('{{NAME}}', name).replaceAll('{{TITLE}}', title) : v);
  const core = CORE_QUESTIONS().map((q) => ({ ...q, default: fill(q.default) }));
  const portal = listPortals().flatMap((id) =>
    Object.entries(loadPortal(id).config.settings ?? {}).map(([k, d]) => ({ key: `${id}.${k}`, portal: id, ...d, default: fill(d.default) })),
  );
  return [...core, ...portal];
}

export function parseAnswer(q, raw) {
  const s = String(raw ?? '').trim();
  if (q.type === 'list') return s ? [...new Set(s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))] : [];
  return s;
}

/** Why an answer is not acceptable, or null. Portal settings may stay empty (asked again by `config`). */
export function checkAnswer(q, value) {
  const empty = value == null || value === '' || (Array.isArray(value) && !value.length);
  if (q.portal) {
    const [id, ...rest] = q.key.split('.');
    return empty ? null : checkSetting(loadPortal(id), rest.join('.'), value);
  }
  if (empty) return q.required ? 'bắt buộc' : null;
  const items = Array.isArray(value) ? value : [value];
  for (const v of items) {
    if (q.enum && !q.enum.includes(v)) return `phải là một trong: ${q.enum.join(', ')}`;
    if (q.pattern && !new RegExp(q.pattern).test(v)) return `"${v}" sai định dạng (${q.pattern})`;
  }
  if (q.key === 'portals') {
    const unknown = items.filter((p) => !listPortals().includes(p));
    if (unknown.length) return `không có bộ vỏ portal: ${unknown.join(', ')}`;
  }
  return null;
}

/** --set key=value (repeatable). Unknown keys are an error so a typo never passes silently. */
export function parseSets(sets, questions) {
  const out = {};
  for (const s of [].concat(sets ?? []).map(String)) {
    const i = s.indexOf('=');
    if (i < 1) throw new GkError(`--set cần dạng khoá=giá-trị, nhận "${s}"`);
    const key = s.slice(0, i).trim();
    const q = questions.find((x) => x.key === key);
    if (!q) throw new GkError(`--set: không có câu hỏi "${key}" (xem: gamekit init <tên> --questions --json)`);
    const v = parseAnswer(q, s.slice(i + 1));
    const err = checkAnswer(q, v);
    if (err) throw new GkError(`--set ${key}: ${err}`);
    out[key] = v;
  }
  return out;
}

/** Fill unanswered GameKit questions with their defaults (no terminal: agents, CI). */
export function withDefaults(questions, preset) {
  const out = { ...preset };
  for (const q of questions) {
    if (q.portal || q.key in out) continue;
    const v = q.default != null ? parseAnswer(q, q.default) : null;
    out[q.key] = Array.isArray(v) ? v : v || null;
  }
  return out;
}

/** portalSettings for `portals`: answer → existing value → default → null. */
export function settingsFor(portals, answers, questions, existing = {}) {
  const out = structuredClone(existing ?? {});
  for (const q of questions) {
    if (q.portal && q.key in answers && !portals.includes(q.portal))
      throw new GkError(`--set ${q.key}: portal ${q.portal} chưa bật — thêm bằng --portal ${q.portal} (config) hoặc --set portals=…,${q.portal} (init)`);
    if (!q.portal || !portals.includes(q.portal)) continue;
    const key = q.key.slice(q.portal.length + 1);
    const cur = out[q.portal]?.[key];
    const v = q.key in answers ? answers[q.key] : cur ?? (q.default || null);
    (out[q.portal] ??= {})[key] = v === '' ? null : v ?? null;
  }
  return out;
}

/**
 * Ask on a terminal, one question at a time: label, description, example, [default].
 * Enter takes the default; a wrong answer is explained and asked again.
 * Portal questions are asked only for the portals chosen in this session (or preset.portals).
 */
export async function ask(questions, { input = process.stdin, output = process.stdout, preset = {} } = {}) {
  const rl = readline.createInterface({ input, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const say = (s) => output.write(`${s}\n`);
  const answers = {};
  try {
    for (const q of questions) {
      if (q.key in preset) {
        answers[q.key] = preset[q.key];
        continue;
      }
      if (q.portal && !(answers.portals ?? preset.portals ?? []).includes(q.portal)) continue;
      say(`\n${q.label}${q.required && !q.portal ? '' : ' (có thể để trống)'}`);
      say(`  ${q.description}`);
      if (q.example) say(`  Ví dụ: ${q.example}`);
      for (;;) {
        output.write(`> ${q.default ? `[${q.default}] ` : ''}`);
        const { value: line, done } = await lines.next();
        const v = parseAnswer(q, done || !String(line).trim() ? q.default ?? '' : line);
        const err = checkAnswer(q, v);
        if (!err) {
          answers[q.key] = Array.isArray(v) ? v : v || null;
          break;
        }
        say(`  ✘ ${err}`);
        if (done) throw new GkError(`Hết input khi đang hỏi "${q.label}"`);
      }
    }
  } finally {
    rl.close();
  }
  return answers;
}
