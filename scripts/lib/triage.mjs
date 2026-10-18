// First feasibility estimate from a recon report. A rough, documented rule of thumb so the
// "cut losses" warning in `status` has a plan to compare against — the user corrects it by hand.

/** How hard it is to get at the logic, by engine/variant (1 = read the source). */
export const ACCESS = {
  'unity:source': 1,
  'godot:source': 1,
  'cocos:source': 1,
  'unity:mono': 2,
  'godot:pck': 2,
  'flash:swf': 2,
  'html5:*': 2.5,
  'laya:*': 3,
  'cocos:creator-2': 3,
  'cocos:creator-3': 3,
  'cocos:native': 4,
  'construct:*': 3,
  'gamemaker:*': 3,
  'unity:webgl': 5,
  'unity:il2cpp': 5,
  'unreal:*': 7,
  'other:*': 7,
  'unknown:*': 5,
};

const accessOf = (r) => ACCESS[`${r.engine}:${r.variant}`] ?? ACCESS[`${r.engine}:*`] ?? 5;

/** Mechanism count → size factor. */
function sizeOf(n) {
  if (n == null) return 2;
  if (n <= 15) return 1;
  if (n <= 50) return 1.5;
  if (n <= 120) return 2.5;
  if (n <= 250) return 4;
  return 6;
}

const half = (x) => Math.max(0.5, Math.round(x * 2) / 2);

/**
 * { factors: [{ name, value, note }], score, verdict, plannedDays } for a recon report.
 * `items` = number of gameplay types in the inventory (null when unknown).
 */
export function triage(r, { ownership = 'own', items = r.inventory?.items?.length ?? null } = {}) {
  const access = accessOf(r);
  const size = sizeOf(items);
  const obf = r.obfuscated ? 1.5 : 1;
  const server = r.sdks?.some((s) => s.cat === 'server') ? 1.5 : 1;
  const factors = [
    { name: 'Truy cập logic', value: access, note: `${r.engine}${r.variant ? ` (${r.variant})` : ''} — 1 = có source, 5 = IL2CPP/WebGL, 7 = native` },
    { name: 'Số cơ chế', value: size, note: items == null ? 'chưa biết — tính như ~30 type' : `${items} type gameplay trong danh mục` },
    { name: 'Làm rối code', value: obf, note: r.obfuscated ? 'có' : r.obfuscated === false ? 'không thấy' : 'chưa kiểm được' },
    { name: 'Phụ thuộc server', value: server, note: server > 1 ? 'có SDK mạng/dữ liệu server' : 'không thấy' },
  ];
  const score = Math.round(access * size * obf * server * 10) / 10;
  const verdict =
    score < 6
      ? { level: 'go', text: 'Làm được.' }
      : score < 15
        ? { level: 'pilot', text: 'Làm được nhưng tốn công — nên chạy thử (pilot: true): dựng trọn một cơ chế chính trước rồi mới cam kết cả game.' }
        : { level: 'risky', text: 'Rủi ro cao — chỉ làm khi chạy thử đạt; cân nhắc bỏ.' };
  const reskin = ownership === 'third-party';
  const plannedDays = {
    P0: 0.5,
    P1: half(0.5 * access * size * obf),
    P2: half(size * (access >= 5 ? 1.3 : 1) * server),
    P3: half(reskin ? 2 + 1.5 * size : 1 + 0.5 * size),
    P4: 1,
    P5: 1,
  };
  return { factors, score, verdict, plannedDays };
}
