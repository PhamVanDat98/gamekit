#!/usr/bin/env python3
"""gameart — biến ảnh raster từ model tạo ảnh (Codex image_gen…) thành asset game đúng spec.

Lệnh:
  key    <ảnh> --out <png>                       tách nền một màu → PNG trong suốt (cắt sát)
  fit    <ảnh…> --out <png> --size WxH            đặt vào canvas đúng cỡ, cùng tỉ lệ, cùng điểm neo
  anim   <ảnh dải frame> --frames N --out <png> --size WxH
                                                  tách nền, cắt N frame, chuẩn hoá, ghép strip ngang
  pixel  <ảnh> --out <png> --size WxH --colors K   hạ về lưới pixel + giảm màu, alpha cứng
  tile   <ảnh> --out <png> --size WxH             tile lặp liền mạch (mặc định cả hai chiều)
  bg     <ảnh> --out <png> --size WxH [--seamless-x]  nền/parallax: cắt phủ đúng cỡ
  sheet  <png…> --out <png>                       contact sheet trên nền ô cờ / sáng / tối để duyệt
  check  <png> [--size WxH] [--alpha] [--key #hex]  kiểm cỡ, alpha, viền ám màu nền; có --size: vật chạm mép

Chỉ cần Python 3.9+ và Pillow (`python3 -m pip install pillow`).
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import deque
from pathlib import Path

try:
    from PIL import Image, ImageChops, ImageDraw, ImageFilter
except ImportError:  # pragma: no cover
    sys.exit("✖ Cần Pillow: python3 -m pip install pillow")

LANCZOS = Image.Resampling.LANCZOS
NEAREST = Image.Resampling.NEAREST
BOX = Image.Resampling.BOX


class UserError(Exception):
    pass


# ---------- tiện ích ----------
def parse_size(s: str | None) -> tuple[int, int]:
    try:
        w, h = (int(v) for v in str(s).lower().split("x"))
        assert w > 0 and h > 0
        return w, h
    except Exception:
        raise UserError("--size dạng <W>x<H>, vd 96x96")


def parse_hex(s: str) -> tuple[int, int, int]:
    s = s.strip().lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6:
        raise UserError(f"màu phải dạng #rrggbb: {s}")
    return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)


def load(path: str) -> Image.Image:
    p = Path(path)
    if not p.exists():
        raise UserError(f"Không có {path}")
    return Image.open(p).convert("RGBA")


def save(img: Image.Image, out: str) -> None:
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG", optimize=True)


def _pixels(img: Image.Image):
    """Flat pixel sequence (Pillow 12 renamed getdata; keep both working)."""
    return img.get_flattened_data() if hasattr(img, "get_flattened_data") else img.getdata()


def dist2(a, b) -> int:
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2


def resize_rgba(img: Image.Image, size: tuple[int, int], method=LANCZOS) -> Image.Image:
    """Resize with premultiplied alpha so transparent pixels don't bleed dark/colored fringes."""
    if img.size == size:
        return img
    if method is NEAREST:
        return img.resize(size, NEAREST)
    return img.convert("RGBa").resize(size, method).convert("RGBA")


def alpha_bbox(img: Image.Image, threshold: int = 8):
    return img.getchannel("A").point(lambda a: 255 if a > threshold else 0).getbbox()


# ---------- tách nền ----------
def estimate_bg(img: Image.Image) -> tuple[int, int, int]:
    """Median of the border pixels: models rarely give a perfectly flat background."""
    w, h = img.size
    px = img.load()
    border = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)]
    border += [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
    return tuple(sorted(c[i] for c in border)[len(border) // 2] for i in range(3))


def key_out(img: Image.Image, bg=None, tol: int = 48, soft: int = 40, min_hole: float = 0.0004) -> tuple[Image.Image, dict]:
    """Remove a flat background color.

    Background = pixels within `tol` of the key color that touch the image border (flood fill), plus
    enclosed pockets of key color (gaps between arm and body) bigger than `min_hole` of the image.
    Other pixels within `tol + soft` become semi-transparent with the key color un-mixed, and edge
    pixels lose the key's tint, so sprites don't keep a magenta/green halo.
    """
    img = img.convert("RGBA")
    w, h = img.size
    bg = tuple(bg) if bg else estimate_bg(img)
    px = list(_pixels(img))
    t2, s2 = tol * tol, (tol + soft) * (tol + soft)
    d = [dist2(p, bg) for p in px]
    is_bg = bytearray(w * h)
    q = deque()
    for x in range(w):
        for i in (x, (h - 1) * w + x):
            if d[i] <= t2 and not is_bg[i]:
                is_bg[i] = 1
                q.append(i)
    for y in range(h):
        for i in (y * w, y * w + w - 1):
            if d[i] <= t2 and not is_bg[i]:
                is_bg[i] = 1
                q.append(i)

    def flood(queue, mark):
        while queue:
            i = queue.popleft()
            x, y = i % w, i // w
            for j in ((i - 1) if x else -1, (i + 1) if x < w - 1 else -1, (i - w) if y else -1, (i + w) if y < h - 1 else -1):
                if j >= 0 and not mark[j] and d[j] <= t2:
                    mark[j] = 1
                    queue.append(j)

    flood(q, is_bg)
    holes = 0
    min_px = max(16, int(min_hole * w * h))
    seen = bytearray(is_bg)
    for i in range(w * h):
        if not seen[i] and d[i] <= t2:
            seen[i] = 1
            stack = deque([i])
            members = [i]
            while stack:
                k = stack.popleft()
                x, y = k % w, k // w
                for j in ((k - 1) if x else -1, (k + 1) if x < w - 1 else -1, (k - w) if y else -1, (k + w) if y < h - 1 else -1):
                    if j >= 0 and not seen[j] and d[j] <= t2:
                        seen[j] = 1
                        stack.append(j)
                        members.append(j)
            if len(members) >= min_px:
                holes += 1
                for k in members:
                    is_bg[k] = 1

    # Semi-transparent edge: any remaining pixel close to the key color is a mix of subject and
    # background (anti-aliasing, thin gaps between legs/fingers). Prompts forbid key-like colors in
    # the subject, so this is safe across the whole image.
    out = []
    soft_px = 0
    for i, p in enumerate(px):
        if is_bg[i]:
            out.append((0, 0, 0, 0))
        elif d[i] <= s2:
            a = max(0.0, min(1.0, ((d[i] ** 0.5) - tol) / max(1, soft)))
            if a < 0.06:
                out.append((0, 0, 0, 0))
            else:
                # Un-mix the key color: observed = a*fg + (1-a)*bg  →  fg = (observed - (1-a)*bg) / a
                fg = tuple(max(0, min(255, round((p[c] - (1 - a) * bg[c]) / a))) for c in range(3))
                out.append((*fg, round(a * p[3])))
            soft_px += 1
        else:
            out.append(p)
    # Spill: opaque pixels within 2 px of transparency still carry a tint of a saturated key
    # (green rim, pink rim). Pull the key's strong channels down to the level of its weak ones.
    hi = [c for c in range(3) if bg[c] >= 160]
    lo = [c for c in range(3) if bg[c] <= 96]
    if hi and lo:
        alpha = Image.new("L", (w, h))
        alpha.putdata([q[3] for q in out])
        near = alpha.point(lambda v: 255 if v < 250 else 0).filter(ImageFilter.MaxFilter(5))
        nd = list(_pixels(near))
        for i, q in enumerate(out):
            if nd[i] and q[3]:
                excess = min(q[c] for c in hi) - max(q[c] for c in lo)
                if excess > 0:
                    out[i] = tuple(q[c] - excess if c in hi else q[c] for c in range(3)) + (q[3],)
    res = Image.new("RGBA", (w, h))
    res.putdata(out)
    return res, {"background": "#%02x%02x%02x" % bg, "holes": holes, "soft_edge_px": soft_px}


# ---------- chuẩn hoá vào canvas ----------
def fit_frames(frames: list[Image.Image], size, anchor: str = "bottom", pad: int = 2, method=LANCZOS, scale_mode: str = "shared") -> list[Image.Image]:
    """Place frames on W×H canvases with ONE shared scale.

    anchor=bottom: each frame cropped to its own bounds, bottom-center aligned (feet stay on one line).
    anchor=center: each frame cropped to its own bounds, centered (icons, items, effects).
    anchor=slot:   every frame cropped to the UNION of all bounds, so movement inside the source
                   slots (jump height, sway) is kept.
    """
    W, H = size
    if anchor == "slot":
        sizes = {f.size for f in frames}
        if len(sizes) != 1:
            raise UserError("anchor=slot cần mọi frame cùng cỡ (cắt từ các ô đều nhau)")
        boxes = [alpha_bbox(f) for f in frames]
        boxes = [b for b in boxes if b]
        if not boxes:
            raise UserError("frame trống (toàn trong suốt) — kiểm bước tách nền")
        u = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
        crops = [f.crop(u) for f in frames]
    else:
        crops = []
        for f in frames:
            b = alpha_bbox(f)
            if not b:
                raise UserError("frame trống (toàn trong suốt) — kiểm bước tách nền")
            crops.append(f.crop(b))
    mw = max(c.width for c in crops)
    mh = max(c.height for c in crops)
    shared = min((W - 2 * pad) / mw, (H - 2 * pad) / mh)
    out = []
    for c in crops:
        s = shared if scale_mode == "shared" else min((W - 2 * pad) / c.width, (H - 2 * pad) / c.height)
        nw, nh = max(1, round(c.width * s)), max(1, round(c.height * s))
        r = resize_rgba(c, (nw, nh), method)
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        x = (W - nw) // 2
        y = (H - nh) // 2 if anchor == "center" else H - pad - nh
        canvas.alpha_composite(r, (x, y))
        out.append(canvas)
    return out


def strip(frames: list[Image.Image]) -> Image.Image:
    W, H = frames[0].size
    s = Image.new("RGBA", (W * len(frames), H), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        s.alpha_composite(f, (i * W, 0))
    return s


# ---------- tách frame từ một ảnh dải ----------
def split_frames(img: Image.Image, n: int | None, rows: int = 1) -> tuple[list[Image.Image], str]:
    """Cut frames out of a generated sheet.

    One row: subjects separated by transparent columns. Fragments much narrower than the others (a hand
    or effect drawn apart from the body) join their nearest neighbor. Models often draw a different
    number of poses than asked, so a count that doesn't match `n` is an error, never a silent merge.
    n=None takes whatever was found. Several rows: an equal grid (n required).
    """
    w, h = img.size
    if rows == 1:
        a = img.getchannel("A").point(lambda v: 255 if v > 24 else 0)
        col = [a.crop((x, 0, x + 1, h)).getbbox() is not None for x in range(w)]
        runs, start = [], None
        for x, filled in enumerate(col + [False]):
            if filled and start is None:
                start = x
            elif not filled and start is not None:
                runs.append([start, x])
                start = None
        runs = [r for r in runs if r[1] - r[0] >= max(2, w // 300)]
        if not runs:
            raise UserError("không thấy hình nào — kiểm bước tách nền")
        while len(runs) > 1:
            widths = sorted(r[1] - r[0] for r in runs)
            median = widths[len(widths) // 2]
            k = min(range(len(runs)), key=lambda i: runs[i][1] - runs[i][0])
            if runs[k][1] - runs[k][0] >= 0.35 * median:
                break
            left = runs[k][0] - runs[k - 1][1] if k > 0 else float("inf")
            right = runs[k + 1][0] - runs[k][1] if k < len(runs) - 1 else float("inf")
            j = k - 1 if left <= right else k + 1
            lo, hi = min(k, j), max(k, j)
            runs[lo] = [runs[lo][0], runs[hi][1]]
            del runs[hi]
        if n is not None and len(runs) != n:
            raise UserError(
                f"ảnh có {len(runs)} hình, cần {n}. Model vẽ sai số tư thế: tạo lại, hoặc dùng --frames auto "
                f"rồi chọn frame bằng --pick (vd --pick 0,1,2,4)"
            )
        return [img.crop((r[0], 0, r[1], h)) for r in runs], "theo khoảng trống"
    if n is None:
        raise UserError("nhiều hàng cần --frames <số frame>")
    cols = -(-n // rows)
    cw, ch = w / cols, h / rows
    out = []
    for i in range(n):
        r, c = divmod(i, cols)
        out.append(img.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch))))
    return out, "ô đều nhau"


# ---------- pixel art ----------
def pixelate(img: Image.Image, size, colors: int = 16, palette: list | None = None, pad: int = 0, anchor: str = "bottom") -> Image.Image:
    """Fit into W×H at true pixel resolution: area-average downscale, hard alpha, reduced palette."""
    W, H = size
    small = fit_frames([img], (W, H), anchor=anchor, pad=pad, method=BOX)[0]
    alpha = small.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
    rgb = Image.new("RGB", small.size, (0, 0, 0))
    rgb.paste(small.convert("RGB"), mask=alpha)
    if palette:
        pal_img = Image.new("P", (1, 1))
        flat = [v for c in palette for v in c]
        pal_img.putpalette(flat + flat[:3] * (256 - len(palette)))
        q = rgb.quantize(palette=pal_img, dither=Image.Dither.NONE)
    else:
        q = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    out = q.convert("RGBA")
    out.putalpha(alpha)
    return out


# ---------- tile / nền ----------
def seamless(img: Image.Image, x: bool = True, y: bool = True, band: float = 0.25) -> Image.Image:
    """Offset by half and cross-fade: edges come from the image interior, so opposite edges meet."""
    w, h = img.size
    rolled = ImageChops.offset(img, w // 2 if x else 0, h // 2 if y else 0)

    def ramp(n):
        bw = max(1, int(n * band))
        return [max(0, 255 - round(255 * min(i, n - 1 - i) / bw)) for i in range(n)]

    mask = Image.new("L", (w, h), 0)
    if x:
        mx = Image.new("L", (w, 1))
        mx.putdata(ramp(w))
        mask = ImageChops.lighter(mask, mx.resize((w, h), NEAREST))
    if y:
        my = Image.new("L", (1, h))
        my.putdata(ramp(h))
        mask = ImageChops.lighter(mask, my.resize((w, h), NEAREST))
    return Image.composite(rolled, img, mask)


def cover(img: Image.Image, size) -> Image.Image:
    W, H = size
    s = max(W / img.width, H / img.height)
    r = resize_rgba(img, (max(W, round(img.width * s)), max(H, round(img.height * s))))
    x, y = (r.width - W) // 2, (r.height - H) // 2
    return r.crop((x, y, x + W, y + H))


def edge_seam(img: Image.Image) -> tuple[float, float]:
    """Mean color jump across the wrap (last column → first column, last row → first row), 0–255.
    Compared to the image's own neighbor-to-neighbor jump this tells whether a tile repeats cleanly."""
    rgb = img.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    jx = sum(sum(abs(px[w - 1, y][c] - px[0, y][c]) for c in range(3)) / 3 for y in range(h)) / h
    jy = sum(sum(abs(px[x, h - 1][c] - px[x, 0][c]) for c in range(3)) / 3 for x in range(w)) / w
    return jx, jy


def inner_jump(img: Image.Image) -> float:
    rgb = img.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    m = w // 2
    return sum(sum(abs(px[m - 1, y][c] - px[m, y][c]) for c in range(3)) / 3 for y in range(h)) / h


# ---------- duyệt ----------
def checker(size, cell=8):
    w, h = size
    img = Image.new("RGBA", size, (205, 205, 205, 255))
    d = ImageDraw.Draw(img)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if (x // cell + y // cell) % 2:
                d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=(240, 240, 240, 255))
    return img


def contact_sheet(files: list[str], height: int = 160) -> Image.Image:
    rows = []
    for f in files:
        img = load(f)
        s = max(1, height // img.height) if img.height <= height else height / img.height
        method = NEAREST if img.height <= height else LANCZOS
        shown = resize_rgba(img, (max(1, round(img.width * s)), max(1, round(img.height * s))), method)
        cells = []
        for bg in ("checker", (244, 241, 234, 255), (34, 35, 42, 255)):
            c = checker(shown.size) if bg == "checker" else Image.new("RGBA", shown.size, bg)
            c.alpha_composite(shown)
            cells.append(c)
        label = f"{Path(f).name}  {img.width}x{img.height}"
        rw = sum(c.width for c in cells) + 8 * 4
        row = Image.new("RGBA", (max(rw, 8 + 7 * len(label)), shown.height + 30), (255, 255, 255, 255))
        x = 8
        for c in cells:
            row.alpha_composite(c, (x, 8))
            x += c.width + 8
        ImageDraw.Draw(row).text((8, shown.height + 12), label, fill=(40, 40, 40, 255))
        rows.append(row)
    W = max(r.width for r in rows)
    sheet = Image.new("RGBA", (W, sum(r.height for r in rows)), (255, 255, 255, 255))
    y = 0
    for r in rows:
        sheet.alpha_composite(r, (0, y))
        y += r.height
    return sheet


def check(img: Image.Image, size=None, need_alpha=False, key=None, tol=60) -> list[str]:
    errs = []
    if size and img.size != size:
        errs.append(f"cỡ {img.width}×{img.height}, spec cần {size[0]}×{size[1]}")
    a = img.getchannel("A")
    lo, hi = a.getextrema()
    if need_alpha:
        if lo == 255:
            errs.append("không có pixel trong suốt — chưa tách nền?")
    if need_alpha and size:  # a final asset needs a margin; `key` output is trimmed tight on purpose
        w, h = img.size
        border = [a.getpixel((x, 0)) for x in range(w)] + [a.getpixel((x, h - 1)) for x in range(w)]
        border += [a.getpixel((0, y)) for y in range(h)] + [a.getpixel((w - 1, y)) for y in range(h)]
        touching = sum(1 for v in border if v > 128)
        if touching > len(border) * 0.02:
            errs.append(f"vật chạm mép ảnh ở {touching} pixel — có thể bị cắt, hoặc thiếu lề (--pad)")
    if key:
        t2 = tol * tol
        halo = sum(1 for p in _pixels(img) if p[3] > 24 and dist2(p, key) <= t2)
        if halo:
            errs.append(f"{halo} pixel còn gần màu nền {('#%02x%02x%02x' % key)} — tăng --tol/--soft khi key, hoặc tạo lại với màu nền khác")
    return errs


# ---------- CLI ----------
def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="gameart", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def keyopts(p):
        p.add_argument("--bg", help="màu nền cần xoá #rrggbb (mặc định: đoán từ viền ảnh)")
        p.add_argument("--tol", type=int, default=48, help="độ lệch màu vẫn tính là nền (mặc định 48)")
        p.add_argument("--soft", type=int, default=40, help="dải viền bán trong suốt (mặc định 40)")

    p = sub.add_parser("key"); p.add_argument("input"); p.add_argument("--out", required=True); keyopts(p)
    p.add_argument("--no-trim", action="store_true"); p.add_argument("--report")

    p = sub.add_parser("fit"); p.add_argument("inputs", nargs="+"); p.add_argument("--out", required=True)
    p.add_argument("--size", required=True); p.add_argument("--anchor", choices=["bottom", "center", "slot"], default="bottom")
    p.add_argument("--pad", type=int, default=2); p.add_argument("--each", action="store_true", help="mỗi ảnh tự co vừa canvas thay vì cùng tỉ lệ")

    p = sub.add_parser("anim"); p.add_argument("input"); p.add_argument("--out", required=True); p.add_argument("--size", required=True)
    p.add_argument("--frames", required=True, help="số frame, hoặc auto = lấy số hình tìm thấy"); p.add_argument("--rows", type=int, default=1)
    p.add_argument("--pick", help="chọn/sắp xếp frame theo chỉ số, vd 0,1,2,4 (sau khi cắt)")
    p.add_argument("--anchor", choices=["bottom", "center", "slot"], default="bottom"); p.add_argument("--pad", type=int, default=2)
    p.add_argument("--keyed", action="store_true", help="ảnh đã trong suốt, bỏ bước tách nền")
    p.add_argument("--frames-dir", help="lưu thêm từng frame"); p.add_argument("--gif", help="lưu GIF xem thử")
    p.add_argument("--fps", type=float, default=8); keyopts(p)

    p = sub.add_parser("pixel"); p.add_argument("input"); p.add_argument("--out", required=True); p.add_argument("--size", required=True)
    p.add_argument("--colors", type=int, default=16); p.add_argument("--palette", help="danh sách #hex cách nhau dấu phẩy, hoặc file .json [\"#hex\", …]")
    p.add_argument("--anchor", choices=["bottom", "center"], default="bottom"); p.add_argument("--keyed", action="store_true"); keyopts(p)

    p = sub.add_parser("tile"); p.add_argument("input"); p.add_argument("--out", required=True); p.add_argument("--size", required=True)
    p.add_argument("--axis", choices=["xy", "x", "y"], default="xy"); p.add_argument("--preview", help="lưu ảnh lặp 3×3 để soi đường nối")

    p = sub.add_parser("bg"); p.add_argument("input"); p.add_argument("--out", required=True); p.add_argument("--size", required=True)
    p.add_argument("--seamless-x", action="store_true", help="lặp ngang liền mạch (parallax cuộn ngang)")

    p = sub.add_parser("sheet"); p.add_argument("inputs", nargs="+"); p.add_argument("--out", required=True); p.add_argument("--height", type=int, default=160)

    p = sub.add_parser("check"); p.add_argument("input"); p.add_argument("--size"); p.add_argument("--alpha", action="store_true")
    p.add_argument("--key", help="màu nền đã xoá, để tìm viền còn ám màu")

    a = ap.parse_args(argv)
    try:
        if a.cmd == "key":
            img, info = key_out(load(a.input), parse_hex(a.bg) if a.bg else None, a.tol, a.soft)
            if not a.no_trim:
                b = alpha_bbox(img)
                if not b:
                    raise UserError("tách xong không còn gì — màu nền trùng màu vật? thử --bg đúng màu, giảm --tol")
                img = img.crop(b)
            save(img, a.out)
            info.update(output=a.out, size=list(img.size))
            if a.report:
                Path(a.report).write_text(json.dumps(info, ensure_ascii=False, indent=2))
            print(f"✔ {a.out} {img.width}×{img.height} (nền {info['background']}, {info['holes']} khoảng hở bên trong)")
        elif a.cmd == "fit":
            frames = fit_frames([load(f) for f in a.inputs], parse_size(a.size), a.anchor, a.pad, scale_mode="each" if a.each else "shared")
            out = strip(frames)
            save(out, a.out)
            print(f"✔ {a.out} {out.width}×{out.height}" + (f" ({len(frames)} frame)" if len(frames) > 1 else ""))
        elif a.cmd == "anim":
            img = load(a.input)
            if not a.keyed:
                img, _ = key_out(img, parse_hex(a.bg) if a.bg else None, a.tol, a.soft)
            want = None if a.frames == "auto" else int(a.frames)
            parts, how = split_frames(img, want, a.rows)
            if a.pick:
                idx = [int(v) for v in a.pick.split(",")]
                bad = [i for i in idx if not 0 <= i < len(parts)]
                if bad:
                    raise UserError(f"--pick ngoài khoảng 0–{len(parts) - 1}: {bad}")
                parts = [parts[i] for i in idx]
            frames = fit_frames(parts, parse_size(a.size), a.anchor, a.pad)
            out = strip(frames)
            save(out, a.out)
            if a.frames_dir:
                for i, f in enumerate(frames):
                    save(f, str(Path(a.frames_dir) / f"{Path(a.out).stem}_{i:02d}.png"))
            if a.gif:
                bgc = Image.new("RGBA", frames[0].size, (244, 241, 234, 255))
                g = [Image.alpha_composite(bgc, f).convert("P", palette=Image.Palette.ADAPTIVE) for f in frames]
                g[0].save(a.gif, save_all=True, append_images=g[1:], duration=round(1000 / a.fps), loop=0, disposal=2)
            print(f"✔ {a.out} {out.width}×{out.height} ({len(frames)} frame, cắt {how}, neo {a.anchor})")
        elif a.cmd == "pixel":
            img = load(a.input)
            if not a.keyed:
                img, _ = key_out(img, parse_hex(a.bg) if a.bg else None, a.tol, a.soft)
            pal = None
            if a.palette:
                src = Path(a.palette)
                items = json.loads(src.read_text()) if src.suffix == ".json" and src.exists() else a.palette.split(",")
                pal = [parse_hex(c) for c in items]
            out = pixelate(img, parse_size(a.size), a.colors, pal, anchor=a.anchor)
            save(out, a.out)
            print(f"✔ {a.out} {out.width}×{out.height}, {len(out.convert('RGB').getcolors(1 << 16) or [])} màu")
        elif a.cmd == "tile":
            W, H = parse_size(a.size)
            img = cover(load(a.input).convert("RGB").convert("RGBA"), (max(W, 256), max(H, 256)))
            before = edge_seam(img)
            img = seamless(img, "x" in a.axis, "y" in a.axis)
            out = resize_rgba(img, (W, H))
            save(out, a.out)
            jx, jy = edge_seam(out)
            ref = inner_jump(out)
            print(f"✔ {a.out} {W}×{H} · bước nhảy qua mép: ngang {before[0]:.0f}→{jx:.0f}, dọc {before[1]:.0f}→{jy:.0f} (trong ảnh ~{ref:.0f})")
            if a.preview:
                pv = Image.new("RGBA", (W * 3, H * 3))
                for yy in range(3):
                    for xx in range(3):
                        pv.paste(out, (xx * W, yy * H))
                save(pv, a.preview)
        elif a.cmd == "bg":
            W, H = parse_size(a.size)
            img = load(a.input).convert("RGB").convert("RGBA")
            img = cover(img, (W, H))
            if a.seamless_x:
                img = seamless(img, True, False, band=0.15)
            save(img, a.out)
            print(f"✔ {a.out} {W}×{H}")
        elif a.cmd == "sheet":
            s = contact_sheet(a.inputs, a.height)
            save(s, a.out)
            print(f"✔ {a.out}")
        elif a.cmd == "check":
            errs = check(load(a.input), parse_size(a.size) if a.size else None, a.alpha, parse_hex(a.key) if a.key else None)
            for e in errs:
                print(f"✖ {a.input}: {e}")
            if not errs:
                print(f"✔ {a.input}")
            return 1 if errs else 0
    except UserError as e:
        print(f"✖ {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
