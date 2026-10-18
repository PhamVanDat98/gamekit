// Build numbers: YYMMDDNN = build date (local time) + sequence within the day, e.g. 26101601.
import { GkError } from './log.mjs';

export const VERSION_RE = /^\d{8}$/;
const pad = (n) => String(n).padStart(2, '0');
const datePrefix = (d) => `${pad(d.getFullYear() % 100)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

/** Next free build number for `date`, given the folder names already in builds/. */
export function nextVersion(existing, date = new Date()) {
  const prefix = datePrefix(date);
  const used = existing.filter((v) => VERSION_RE.test(v) && v.startsWith(prefix)).map((v) => Number(v.slice(6)));
  const n = used.length ? Math.max(...used) + 1 : 1;
  if (n > 99) throw new GkError(`Đã có 99 bản build trong ngày ${prefix} — dùng --version để chỉ định`);
  return `${prefix}${pad(n)}`;
}

/** Why `v` is not a build number (8 digits, YYMMDD a real date, NN 01–99), or null. */
export function versionError(v) {
  const s = String(v);
  if (!VERSION_RE.test(s)) return `phải là 8 chữ số YYMMDDNN, nhận "${s}"`;
  const [y, m, d, n] = [0, 2, 4, 6].map((i) => Number(s.slice(i, i + 2)));
  const date = new Date(2000 + y, m - 1, d);
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return `YYMMDD "${s.slice(0, 6)}" không phải ngày có thật (${s})`;
  if (n < 1) return `số thứ tự NN phải từ 01 đến 99, nhận "${s.slice(6)}" (${s})`;
  return null;
}

/** A --version given by hand: a valid build number and never an existing build (builds are not overwritten). */
export function checkVersion(v, existing) {
  const s = String(v);
  const err = versionError(s);
  if (err) throw new GkError(`--version ${err}`);
  if (existing.includes(s)) throw new GkError(`builds/${s} đã có — không ghi đè bản build cũ`);
  return s;
}

export const latestVersion = (existing) => existing.filter((v) => VERSION_RE.test(v)).sort().at(-1) ?? null;

/** Copyright year of a build: 2026 for 26101601. */
export const copyrightYear = (v) => `20${String(v).slice(0, 2)}`;
