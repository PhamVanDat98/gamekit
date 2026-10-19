#!/usr/bin/env python3
"""voxel — dựng model voxel bằng code rồi render sprite isometric cho game, xuất .vox cho MagicaVoxel.

Model là file Python (vd hero.vox.py):

    PALETTE = {"g": "#5fa85b", "G": "#3d7a3f", "k": "#1b1630"}
    SIZE = (16, 16, 20)            # x (phải), y (0 = mặt trước, hướng về người xem), z (lên)
    FRAMES = 1                     # >1: build() được gọi cho từng frame
    def build(v, frame=0):
        v.box(0, 0, 0, 16, 16, 2, "g")

Lệnh:
  render <model> --out <png> [--px 4] [--dir 0-3 | --dirs 4] [--outline "#hex"] [--canvas WxH] [--scale N]
  sheet  <model…> --out <png>          xem nhanh 4 hướng của từng model, phóng to, nền ô cờ
  export <model> --out <file.vox>      mở/sửa tiếp trong MagicaVoxel
  info   <model>                       số voxel, màu, kích thước

Cần Python 3.9+ và Pillow.
"""
from __future__ import annotations

import argparse
import math
import runpy
import struct
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:  # pragma: no cover
    sys.exit("✖ Cần Pillow: python3 -m pip install pillow")


class UserError(Exception):
    pass


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        raise UserError(f"màu phải dạng #rrggbb: {h}")
    return int(h[:2], 16), int(h[2:4], 16), int(h[4:], 16)


class Vox:
    """Voxel grid. Coordinates: x to the right, y from the front (y = 0 faces the viewer) to the back, z up. Boxes are half-open
    (x0 ≤ x < x1). Colors are palette keys; None erases."""

    def __init__(self, size, palette: dict[str, str]):
        self.X, self.Y, self.Z = (int(n) for n in size)
        self.palette = {k: hex_rgb(v) for k, v in palette.items()}
        self.v: dict[tuple[int, int, int], str] = {}

    # --- cơ bản
    def _ok(self, c):
        if c is not None and c not in self.palette:
            raise UserError(f"màu '{c}' không có trong PALETTE ({', '.join(self.palette)})")

    def set(self, x, y, z, c):
        self._ok(c)
        x, y, z = int(x), int(y), int(z)
        if 0 <= x < self.X and 0 <= y < self.Y and 0 <= z < self.Z:
            if c is None:
                self.v.pop((x, y, z), None)
            else:
                self.v[(x, y, z)] = c

    def get(self, x, y, z):
        return self.v.get((int(x), int(y), int(z)))

    # --- khối
    def box(self, x0, y0, z0, x1, y1, z1, c, hollow=False):
        for x in range(int(x0), int(x1)):
            for y in range(int(y0), int(y1)):
                for z in range(int(z0), int(z1)):
                    if not hollow or x in (x0, x1 - 1) or y in (y0, y1 - 1) or z in (z0, z1 - 1):
                        self.set(x, y, z, c)

    def ellipsoid(self, cx, cy, cz, rx, ry, rz, c):
        for x in range(math.floor(cx - rx), math.ceil(cx + rx) + 1):
            for y in range(math.floor(cy - ry), math.ceil(cy + ry) + 1):
                for z in range(math.floor(cz - rz), math.ceil(cz + rz) + 1):
                    if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + ((z + 0.5 - cz) / rz) ** 2 <= 1:
                        self.set(x, y, z, c)

    def sphere(self, cx, cy, cz, r, c):
        self.ellipsoid(cx, cy, cz, r, r, r, c)

    def cylinder(self, cx, cy, z0, z1, r, c):
        for x in range(math.floor(cx - r), math.ceil(cx + r) + 1):
            for y in range(math.floor(cy - r), math.ceil(cy + r) + 1):
                if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r:
                    for z in range(int(z0), int(z1)):
                        self.set(x, y, z, c)

    def line(self, x0, y0, z0, x1, y1, z1, c):
        n = int(max(abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))) or 1
        for i in range(n + 1):
            t = i / n
            self.set(round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t), round(z0 + (z1 - z0) * t), c)

    def layer(self, z, rows: list[str] | str, x0=0, y0=0):
        """Paint one horizontal slice from text: rows go front (y0) to back, '.' or ' ' = leave as is,
        '_' = erase, other characters = palette keys."""
        if isinstance(rows, str):
            rows = [r for r in rows.strip("\n").split("\n")]
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row.strip()):
                if ch in ". ":
                    continue
                self.set(x0 + dx, y0 + dy, z, None if ch == "_" else ch)

    # --- sửa
    def mirror_x(self):
        """Copy the left half onto the right (write half of anything symmetric)."""
        for (x, y, z), c in list(self.v.items()):
            if x < self.X / 2:
                self.v[(self.X - 1 - x, y, z)] = c

    def recolor(self, src, dst, where=None):
        self._ok(dst)
        for k, c in list(self.v.items()):
            if c == src and (where is None or where(*k)):
                self.v[k] = dst

    def speckle(self, src, dst, chance=0.15, seed=1):
        """Sprinkle a second shade on visible surfaces of one color (grass, stone), reproducibly."""
        import random

        rnd = random.Random(seed)
        self._ok(dst)
        for k in sorted(self.v):
            if self.v[k] == src and rnd.random() < chance:
                self.v[k] = dst

    def shift(self, dx=0, dy=0, dz=0, where=None):
        moved = {}
        for (x, y, z), c in list(self.v.items()):
            if where is None or where(x, y, z):
                del self.v[(x, y, z)]
                moved[(x + dx, y + dy, z + dz)] = c
        for (x, y, z), c in moved.items():
            self.set(x, y, z, c)


# ---------- nạp model ----------
def load_model(path: str, frame: int = 0) -> tuple[Vox, int]:
    p = Path(path)
    if not p.exists():
        raise UserError(f"Không có {path}")
    ns = runpy.run_path(str(p))
    for key in ("PALETTE", "SIZE", "build"):
        if key not in ns:
            raise UserError(f"{path}: thiếu {key}")
    frames = int(ns.get("FRAMES", 1))
    v = Vox(ns["SIZE"], ns["PALETTE"])
    try:
        ns["build"](v, frame) if frames > 1 or ns["build"].__code__.co_argcount > 1 else ns["build"](v)
    except UserError:
        raise
    except Exception as e:  # show the model author where it broke
        tb = e.__traceback__
        line = None
        while tb:
            if tb.tb_frame.f_code.co_filename == str(p):
                line = tb.tb_lineno
            tb = tb.tb_next
        raise UserError(f"{path}{f':{line}' if line else ''}: {type(e).__name__}: {e}")
    if not v.v:
        raise UserError(f"{path}: model trống")
    return v, frames


# ---------- render isometric ----------
def _rot(v: Vox, d: int) -> tuple[dict, int, int]:
    """Turn the model d×90° around z (d=1: the viewer walks a quarter turn around it)."""
    X, Y = v.X, v.Y
    cur = dict(v.v)
    for _ in range(d % 4):
        cur = {(y, X - 1 - x, z): c for (x, y, z), c in cur.items()}
        X, Y = Y, X
    # y = 0 is the model's front: flip so that face is the one turned toward the viewer (lower left)
    cur = {(x, Y - 1 - y, z): c for (x, y, z), c in cur.items()}
    return cur, X, Y


def shade(rgb, k):
    return tuple(max(0, min(255, round(ch * k))) for ch in rgb)


def render(v: Vox, px: int = 4, d: int = 0, outline: str | None = None, light=(1.0, 0.8, 0.62), edge: bool = True) -> Image.Image:
    """2:1 isometric, viewed from front-right-above. Each voxel: top face lit, left (front) face mid,
    right face dark; hidden faces culled; painter's order back-to-front."""
    if px < 2 or px % 2:
        raise UserError("--px phải là số chẵn ≥ 2")
    cells, X, Y = _rot(v, d)
    h = px // 2
    # screen position of a voxel's top vertex: x grows right-down, y grows left-down, z up
    xs = [(x - y) * px for x, y, z in cells]
    ys = [(x + y) * h - z * px for x, y, z in cells]
    ox, oy = -min(xs) + px + 2, -min(ys) + 2
    W = max(xs) - min(xs) + 2 * px + 4
    H = max(ys) - min(ys) + 2 * px + 4
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    pal = v.palette
    for (x, y, z) in sorted(cells, key=lambda k: (k[0] + k[1] + k[2], k[2])):
        c = pal[cells[(x, y, z)]]
        sx, sy = (x - y) * px + ox, (x + y) * h - z * px + oy
        top = [(sx, sy), (sx + px, sy + h), (sx, sy + px), (sx - px, sy + h)]
        left = [(sx - px, sy + h), (sx, sy + px), (sx, sy + 2 * px), (sx - px, sy + px + h)]
        right = [(sx, sy + px), (sx + px, sy + h), (sx + px, sy + px + h), (sx, sy + 2 * px)]
        if (x, y + 1, z) not in cells:
            dr.polygon(left, fill=shade(c, light[1]) + (255,))
        if (x + 1, y, z) not in cells:
            dr.polygon(right, fill=shade(c, light[2]) + (255,))
        if (x, y, z + 1) not in cells:
            dr.polygon(top, fill=shade(c, light[0]) + (255,))
            if edge:
                # a 1px darker rim where the top meets a drop: reads as a crisp voxel edge at small sizes
                rim = shade(c, light[0] * 0.86) + (255,)
                if (x, y + 1, z) not in cells:
                    dr.line([top[3], top[2]], fill=rim)
                if (x + 1, y, z) not in cells:
                    dr.line([top[2], top[1]], fill=rim)
    if outline:
        a = img.getchannel("A")
        grown = a.filter(ImageFilter.MaxFilter(3))
        ink = Image.new("RGBA", img.size, hex_rgb(outline) + (255,))
        base = Image.new("RGBA", img.size, (0, 0, 0, 0))
        base.paste(ink, mask=grown)
        base.alpha_composite(img)
        img = base
    bb = img.getchannel("A").getbbox()
    return img.crop(bb) if bb else img


def place(imgs: list[Image.Image], canvas=None, pad: int = 1) -> list[Image.Image]:
    """Put renders on one canvas size, bottom-center, never resampled (pixel-exact)."""
    W = canvas[0] if canvas else max(i.width for i in imgs) + 2 * pad
    H = canvas[1] if canvas else max(i.height for i in imgs) + 2 * pad
    out = []
    for i in imgs:
        if i.width > W or i.height > H:
            raise UserError(f"render {i.width}×{i.height} lớn hơn canvas {W}×{H}: giảm --px hoặc làm model nhỏ lại")
        c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        c.alpha_composite(i, ((W - i.width) // 2, H - pad - i.height if H - pad - i.height >= 0 else 0))
        out.append(c)
    return out


def strip(imgs: list[Image.Image]) -> Image.Image:
    W, H = imgs[0].size
    s = Image.new("RGBA", (W * len(imgs), H), (0, 0, 0, 0))
    for k, i in enumerate(imgs):
        s.alpha_composite(i, (k * W, 0))
    return s


# ---------- MagicaVoxel .vox ----------
def write_vox(v: Vox, out: str) -> int:
    if max(v.X, v.Y, v.Z) > 256:
        raise UserError(".vox giới hạn 256 mỗi chiều")
    keys = sorted(set(v.v.values()))
    if len(keys) > 255:
        raise UserError(".vox giới hạn 255 màu")
    index = {k: i + 1 for i, k in enumerate(keys)}

    def chunk(cid, content, children=b""):
        return cid + struct.pack("<ii", len(content), len(children)) + content + children

    size = chunk(b"SIZE", struct.pack("<iii", v.X, v.Y, v.Z))
    xyzi = chunk(b"XYZI", struct.pack("<i", len(v.v)) + b"".join(struct.pack("<BBBB", x, y, z, index[c]) for (x, y, z), c in sorted(v.v.items())))
    rgba = bytearray()
    for i in range(256):
        if i < len(keys):
            rgba += bytes(v.palette[keys[i]]) + b"\xff"
        else:
            rgba += b"\x00\x00\x00\xff"
    main = chunk(b"MAIN", b"", size + xyzi + chunk(b"RGBA", bytes(rgba)))
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_bytes(b"VOX " + struct.pack("<i", 150) + main)
    return len(v.v)


def checker(size, cell=8):
    img = Image.new("RGBA", size, (205, 205, 205, 255))
    d = ImageDraw.Draw(img)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=(240, 240, 240, 255))
    return img


def save(img, out):
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG", optimize=True)


def parse_size(s):
    try:
        w, h = (int(n) for n in s.lower().split("x"))
        return w, h
    except Exception:
        raise UserError("--canvas dạng <W>x<H>, vd 64x64")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="voxel", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("render"); p.add_argument("model"); p.add_argument("--out", required=True)
    p.add_argument("--px", type=int, default=4, help="nửa bề ngang một voxel trên màn hình, số chẵn (mặc định 4)")
    p.add_argument("--dir", type=int, default=0, help="hướng nhìn 0–3 (mỗi bước 90°)")
    p.add_argument("--dirs", type=int, choices=[1, 2, 4], help="xuất nhiều hướng thành strip ngang")
    p.add_argument("--outline", help="viền 1px quanh hình, vd #1b1630"); p.add_argument("--no-edge", action="store_true")
    p.add_argument("--canvas", help="đặt vào canvas WxH (đáy-giữa), không co giãn"); p.add_argument("--scale", type=int, default=1)
    p = sub.add_parser("sheet"); p.add_argument("models", nargs="+"); p.add_argument("--out", required=True)
    p.add_argument("--px", type=int, default=4); p.add_argument("--outline"); p.add_argument("--zoom", type=int, default=3)
    p = sub.add_parser("export"); p.add_argument("model"); p.add_argument("--out", required=True); p.add_argument("--frame", type=int, default=0)
    p = sub.add_parser("info"); p.add_argument("model")
    a = ap.parse_args(argv)
    try:
        if a.cmd == "render":
            v, frames = load_model(a.model)
            dirs = list(range(a.dirs)) if a.dirs else [a.dir]
            if a.dirs == 2:
                dirs = [0, 1]
            imgs = []
            for d in dirs:
                for f in range(frames):
                    vf = v if f == 0 else load_model(a.model, f)[0]
                    imgs.append(render(vf, a.px, d, a.outline, edge=not a.no_edge))
            placed = place(imgs, parse_size(a.canvas) if a.canvas else None)
            out = strip(placed)
            if len(dirs) > 1 and frames > 1:  # rows = directions, columns = frames
                W, H = placed[0].size
                out = Image.new("RGBA", (W * frames, H * len(dirs)), (0, 0, 0, 0))
                for i, im in enumerate(placed):
                    out.alpha_composite(im, ((i % frames) * W, (i // frames) * H))
            if a.scale > 1:
                out = out.resize((out.width * a.scale, out.height * a.scale), Image.Resampling.NEAREST)
            save(out, a.out)
            what = f"{len(dirs)} hướng" + (f" × {frames} frame" if frames > 1 else "")
            print(f"✔ {a.out} {out.width}×{out.height} ({what}, mỗi ô {placed[0].width * a.scale}×{placed[0].height * a.scale})")
        elif a.cmd == "sheet":
            rows = []
            for m in a.models:
                v, _ = load_model(m)
                imgs = place([render(v, a.px, d, a.outline) for d in range(4)])
                r = strip(imgs)
                r = r.resize((r.width * a.zoom, r.height * a.zoom), Image.Resampling.NEAREST)
                bg = checker(r.size)
                bg.alpha_composite(r)
                lab = Image.new("RGBA", (r.width, r.height + 18), (255, 255, 255, 255))
                lab.alpha_composite(bg, (0, 18))
                ImageDraw.Draw(lab).text((4, 3), f"{Path(m).name}  dir 0-3", fill=(40, 40, 40, 255))
                rows.append(lab)
            W = max(r.width for r in rows)
            out = Image.new("RGBA", (W, sum(r.height for r in rows)), (255, 255, 255, 255))
            y = 0
            for r in rows:
                out.alpha_composite(r, (0, y))
                y += r.height
            save(out, a.out)
            print(f"✔ {a.out}")
        elif a.cmd == "export":
            v, _ = load_model(a.model, a.frame)
            n = write_vox(v, a.out)
            print(f"✔ {a.out} ({n} voxel, {v.X}×{v.Y}×{v.Z})")
        elif a.cmd == "info":
            v, frames = load_model(a.model)
            used = sorted(set(v.v.values()))
            print(f"{a.model}: {v.X}×{v.Y}×{v.Z}, {len(v.v)} voxel, {len(used)} màu ({', '.join(used)}), {frames} frame")
    except UserError as e:
        print(f"✖ {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
