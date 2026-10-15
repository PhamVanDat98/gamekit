// Output helpers. Plain text so it reads well in agent transcripts and terminals.
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const log = {
  info: (...a) => console.log(...a),
  ok: (msg) => console.log(c(32, '✔ ') + msg),
  warn: (msg) => console.log(c(33, '⚠ ') + msg),
  fail: (msg) => console.log(c(31, '✘ ') + msg),
  head: (msg) => console.log(c(1, msg)),
  dim: (msg) => console.log(c(2, msg)),
};

export class GkError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.exitCode = code;
  }
}

/** Collects problems; `report()` prints them and returns true when clean. */
export class Problems {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }
  error(where, msg) {
    this.errors.push(`${where}: ${msg}`);
  }
  warn(where, msg) {
    this.warnings.push(`${where}: ${msg}`);
  }
  get ok() {
    return this.errors.length === 0;
  }
  merge(other) {
    this.errors.push(...other.errors);
    this.warnings.push(...other.warnings);
    return this;
  }
  report(title) {
    for (const w of this.warnings) log.warn(w);
    for (const e of this.errors) log.fail(e);
    if (this.ok) log.ok(`${title}: đạt${this.warnings.length ? ` (${this.warnings.length} cảnh báo)` : ''}`);
    else log.fail(`${title}: ${this.errors.length} lỗi`);
    return this.ok;
  }
}
