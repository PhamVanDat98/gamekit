#!/usr/bin/env python3
"""animate — animation 2D cho game, khai báo bằng dữ liệu cho từng dự án.

Một dự án có khung xương riêng (*.skeleton.json) và animation riêng (*.anim.json): keyframe có easing,
sóng (đuôi, tóc, cánh, thân rắn), IK hai khúc (chân đặt lên điểm cho trước). Cùng một file animation cho ra:

  library                                       liệt kê khung xương và animation mẫu
  new <mẫu> --out <thư mục>                      chép mẫu (vd humanoid/walk, quadruped/walk) về dự án để sửa
  preview <anim.json> --out <gif|png>            người que chuyển động (GIF) hoặc dải frame (PNG) để duyệt
  pose <anim.json> --cell WxH --out <png>        dải tư thế theo ô — ảnh tham chiếu cho model vẽ từng frame
  rig <rig.json> --anim <anim.json> --size WxH --out <png>   ảnh cắt rời (bộ phận) chuyển động theo xương
  tween <sprite.png> --anim <anim.json> --size WxH --out <png>  cả sprite chuyển động (nhún, nảy, lắc, xoay…)
  check <anim.json>                             kiểm file, báo chỗ giật (xương xoay > 100° hoặc cả người dời xa giữa hai frame)
  bake <anim.json> --out <json>                  góc/vị trí từng xương mỗi frame để game tự chạy animation
  mocap <file.bvh> --out <anim.json> [--cycle]    chuyển động thật từ motion capture → animation cho khung humanoid

Cần Python 3.9+ và Pillow.
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover
    sys.exit("✖ Cần Pillow: python3 -m pip install pillow")

HERE = Path(__file__).resolve().parent
LIBRARY = HERE.parent / "library"
LANCZOS = Image.Resampling.LANCZOS
GROUND = 0.92  # ground line at 92% of a slot's height (same geometry as game-raster-art guide/canvas)


class UserError(Exception):
    pass


# ---------- tiện ích ----------
def load_json(path) -> dict:
    p = Path(path)
    if not p.exists():
        raise UserError(f"Không có {path}")
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except ValueError as e:
        raise UserError(f"{path}: JSON hỏng ({e})")


def dump_json(data) -> str:
    """Indented JSON with every short list (a key [t, v, ease], a point [x, y]) kept on one line."""
    def fmt(o, ind):
        one = json.dumps(o, ensure_ascii=False)
        if not isinstance(o, (dict, list)) or (isinstance(o, list) and len(one) < 80 and
                                                  all(not isinstance(v, (dict, list)) or (isinstance(v, list) and
                                                      all(not isinstance(w, (dict, list)) for w in v)) for v in o)):
            return one
        pad = " " * (ind + 1)
        if isinstance(o, dict):
            if not o:
                return "{}"
            return "{\n" + ",\n".join(f"{pad}{json.dumps(k, ensure_ascii=False)}: {fmt(v, ind + 1)}" for k, v in o.items()) + "\n" + " " * ind + "}"
        return "[\n" + ",\n".join(pad + fmt(v, ind + 1) for v in o) + "\n" + " " * ind + "]" if o else "[]"
    return fmt(data, 0) + "\n"


def parse_size(s) -> tuple[int, int]:
    try:
        w, h = (int(v) for v in str(s).lower().split("x"))
        assert w > 0 and h > 0
        return w, h
    except Exception:
        raise UserError("cỡ dạng <W>x<H>, vd 96x96")


def save(img: Image.Image, out) -> None:
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG", optimize=True)


def save_gif(frames: list[Image.Image], path, fps: float, bg=(244, 241, 234, 255)) -> None:
    base = Image.new("RGBA", frames[0].size, bg)
    g = [Image.alpha_composite(base, f.convert("RGBA")).convert("P", palette=Image.Palette.ADAPTIVE) for f in frames]
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    g[0].save(path, save_all=True, append_images=g[1:], duration=round(1000 / fps), loop=0, disposal=2)


def resize_rgba(img: Image.Image, size) -> Image.Image:
    if img.size == tuple(size):
        return img
    return img.convert("RGBa").resize(size, LANCZOS).convert("RGBA")


def alpha_bbox(img: Image.Image, threshold: int = 8):
    return img.getchannel("A").point(lambda a: 255 if a > threshold else 0).getbbox()


# Angle convention, everywhere: 0 = pointing down, 180 = up, -90 = forward (character faces right),
# 90 = backward. Positive rotation is clockwise on screen. y grows downward; the ground is y = 0.
def _dir(a):
    r = math.radians(a)
    return -math.sin(r), math.cos(r)


def _ang(dx, dy):
    return math.degrees(math.atan2(-dx, dy))


EASE = {
    "linear": lambda x: x,
    "smooth": lambda x: x * x * (3 - 2 * x),
    "in": lambda x: x * x,
    "out": lambda x: 1 - (1 - x) * (1 - x),
    "step": lambda x: 0.0,
}


# ---------- khung xương ----------
class Skeleton:
    """bones: {name: {parent, length, angle (rest, world), at (0–1 along parent), offset [dx, dy],
    side front|back|mid, width, shape line|circle, face, color, z}}; root: rest position of the root
    bone's start [x, y] (ground y = 0, up negative)."""

    def __init__(self, data: dict, where: str = "skeleton"):
        self.where = where
        bones = data.get("bones") or {}
        if not bones:
            raise UserError(f"{where}: thiếu 'bones'")
        self.bones = {}
        for name, b in bones.items():
            if "length" not in b:
                raise UserError(f"{where}: xương '{name}' thiếu 'length'")
            par = b.get("parent")
            if par is not None and par not in bones:
                raise UserError(f"{where}: xương '{name}' có cha '{par}' không tồn tại")
            self.bones[name] = {"parent": par, "length": float(b["length"]), "angle": float(b.get("angle", 0)),
                                "at": float(b.get("at", 1.0)), "offset": tuple(b.get("offset", (0, 0))),
                                "side": b.get("side", "mid"), "width": float(b.get("width", 0.16)),
                                "shape": b.get("shape", "line"), "face": bool(b.get("face", False)),
                                "color": tuple(b["color"]) if b.get("color") else None, "z": float(b.get("z", 0))}
        roots = [n for n, b in self.bones.items() if b["parent"] is None]
        if len(roots) != 1:
            raise UserError(f"{where}: cần đúng một xương gốc (không có parent), đang có {roots or 'không'}")
        self.root = roots[0]
        self.root_pos = tuple(data.get("root", (0.0, 0.0)))
        self.order = []
        seen = set()

        def visit(n, stack=()):
            if n in seen:
                return
            if n in stack:
                raise UserError(f"{where}: xương lặp vòng ở '{n}'")
            p = self.bones[n]["parent"]
            if p:
                visit(p, stack + (n,))
            seen.add(n)
            self.order.append(n)

        for n in self.bones:
            visit(n)

    def children(self, name):
        return [n for n in self.order if self.bones[n]["parent"] == name]


def load_skeleton(path) -> Skeleton:
    return Skeleton(load_json(path), str(path))


# ---------- animation ----------
class Anim:
    """{skeleton: path, frames, fps, loop, pivot, keys: {bone: {channel: [[t, v, ease?], …]}},
    waves: [{bones, channel, amp, cycles, phase, phase_step, decay}], ik: [{bones: [a, b], target: [[t, [x, y]], …],
    knee: forward|back, foot, foot_angle: [[t, deg], …]}]}. Channels: rot (deg, added to rest + parent),
    x, y (root only, offset from rest, skeleton units), sx, sy (scale for rig parts / tween)."""

    CHANNELS = ("rot", "x", "y", "sx", "sy")

    def __init__(self, data: dict, path: str):
        self.path = path
        self.data = data
        self.frames = int(data.get("frames", 8))
        if self.frames < 1:
            raise UserError(f"{path}: frames ≥ 1")
        self.fps = float(data.get("fps", 10))
        self.loop = bool(data.get("loop", True))
        self.pivot = data.get("pivot", "bottom")
        sk = data.get("skeleton")
        if isinstance(sk, dict):
            self.skeleton = Skeleton(sk, f"{path}: skeleton")
        elif isinstance(sk, str):
            p = Path(sk) if Path(sk).is_absolute() else Path(path).resolve().parent / sk
            if not p.exists() and (LIBRARY / sk).exists():
                p = LIBRARY / sk
            self.skeleton = load_skeleton(p)
        else:
            raise UserError(f"{path}: thiếu 'skeleton' (đường dẫn hoặc khai báo trực tiếp)")
        bones = self.skeleton.bones
        self.keys = {}
        for bone, chans in (data.get("keys") or {}).items():
            if bone not in bones:
                raise UserError(f"{path}: keys có xương '{bone}' không có trong khung xương")
            for ch, track in chans.items():
                if ch not in self.CHANNELS:
                    raise UserError(f"{path}: kênh '{ch}' của '{bone}' không hợp lệ (có: {', '.join(self.CHANNELS)})")
                if ch in ("x", "y") and bone != self.skeleton.root:
                    raise UserError(f"{path}: chỉ xương gốc '{self.skeleton.root}' có kênh x/y")
                self.keys.setdefault(bone, {})[ch] = self._track(track, f"{bone}.{ch}")
        self.waves = []
        for w in data.get("waves") or []:
            for b in w.get("bones", []):
                if b not in bones:
                    raise UserError(f"{path}: waves có xương '{b}' không tồn tại")
            self.waves.append(w)
        self.ik = []
        for k in data.get("ik") or []:
            ch = k.get("bones", [])
            if len(ch) != 2 or any(b not in bones for b in ch) or bones[ch[1]]["parent"] != ch[0]:
                raise UserError(f"{path}: ik cần 2 xương cha-con, vd [\"thigh_front\", \"shin_front\"]")
            item = {"bones": ch, "target": self._track(k.get("target"), f"ik {ch[1]}.target"), "knee": k.get("knee", "forward")}
            if k.get("foot"):
                if k["foot"] not in bones:
                    raise UserError(f"{path}: ik foot '{k['foot']}' không tồn tại")
                item["foot"] = k["foot"]
                item["foot_angle"] = self._track(k.get("foot_angle", [[0, -90]]), f"ik {k['foot']}.foot_angle")
            self.ik.append(item)

    def _track(self, track, where):
        if track is None:
            raise UserError(f"{self.path}: {where} trống")
        if not isinstance(track, list):
            return [(0.0, track, "linear")]
        out = []
        for k in track:
            if not isinstance(k, list) or len(k) < 2:
                raise UserError(f"{self.path}: {where}: mỗi key là [t, giá trị] hoặc [t, giá trị, \"easing\"]")
            ease = k[2] if len(k) > 2 else "smooth"
            if ease not in EASE:
                raise UserError(f"{self.path}: {where}: easing '{ease}' (có: {', '.join(EASE)})")
            out.append((float(k[0]), tuple(k[1]) if isinstance(k[1], list) else float(k[1]), ease))
        out.sort(key=lambda k: k[0])
        return out

    def t_of(self, i: int) -> float:
        return i / self.frames if self.loop else (i / (self.frames - 1) if self.frames > 1 else 0.0)

    def sample(self, track, t):
        if len(track) == 1:
            return track[0][1]
        pts = track
        if self.loop:
            t %= 1.0
            first, last = pts[0], pts[-1]
            if t < first[0] or t >= last[0]:  # wrap from the last key to the first one of the next cycle
                t0, v0, e = last
                t1, v1 = first[0] + 1.0, first[1]
                tt = t if t >= last[0] else t + 1.0
                return _mix(v0, v1, EASE[e]((tt - t0) / max(1e-9, t1 - t0)))
        else:
            if t <= pts[0][0]:
                return pts[0][1]
            if t >= pts[-1][0]:
                return pts[-1][1]
        for (t0, v0, e), (t1, v1, _) in zip(pts, pts[1:]):
            if t0 <= t <= t1:
                return _mix(v0, v1, EASE[e]((t - t0) / max(1e-9, t1 - t0)))
        return pts[-1][1]

    def channels(self, t: float) -> dict:
        """{bone: {rot, sx, sy}, root: {x, y}} at time t, keys + waves (IK applied in pose)."""
        out = {b: {"rot": 0.0, "sx": 1.0, "sy": 1.0, "x": 0.0, "y": 0.0} for b in self.skeleton.bones}
        for bone, chans in self.keys.items():
            for ch, track in chans.items():
                out[bone][ch] = float(self.sample(track, t))
        for w in self.waves:
            ch = w.get("channel", "rot")
            amp, cyc, ph, step, decay = (float(w.get(k, d)) for k, d in (("amp", 10), ("cycles", 1), ("phase", 0), ("phase_step", 0.1), ("decay", 1)))
            for i, b in enumerate(w["bones"]):
                out[b][ch] += amp * (decay ** i) * math.sin(2 * math.pi * (cyc * t - ph - i * step))
        return out


def _mix(a, b, f):
    if isinstance(a, tuple):
        return tuple(p + (q - p) * f for p, q in zip(a, b))
    return a + (b - a) * f


def load_anim(path) -> Anim:
    return Anim(load_json(path), str(path))


# ---------- tính tư thế ----------
def two_bone(start, target, a, b, knee="forward"):
    dx, dy = target[0] - start[0], target[1] - start[1]
    dist = math.hypot(dx, dy)
    d = max(1e-6, min(dist, a + b - 1e-4))
    alpha = math.degrees(math.acos(max(-1.0, min(1.0, (a * a + d * d - b * b) / (2 * a * d)))))
    base = _ang(dx, dy)
    first = base - alpha if knee == "forward" else base + alpha
    ux, uy = _dir(first)
    mid = (start[0] + a * ux, start[1] + a * uy)
    end = (start[0] + dx * d / dist, start[1] + dy * d / dist) if dist > 1e-6 else target
    return first, _ang(end[0] - mid[0], end[1] - mid[1])


def pose_at(anim: Anim, t: float) -> dict:
    """World pose: {bone: {start, end, angle, rot (own), cum (own + ancestors), sx, sy}}."""
    sk = anim.skeleton
    ch = anim.channels(t)
    P = {}
    override = {}  # bone -> world angle forced by IK / foot lock

    def place(name):
        b = sk.bones[name]
        c = ch[name]
        if b["parent"] is None:
            start = (sk.root_pos[0] + c["x"], sk.root_pos[1] + c["y"])
            parent_cum = 0.0
        else:
            p = P[b["parent"]]
            pb = sk.bones[b["parent"]]
            ux, uy = _dir(p["angle"])
            ox, oy = b["offset"]
            # offset is given in the rest pose; it turns with the parent
            r = math.radians(p["cum"])
            ox, oy = ox * math.cos(r) - oy * math.sin(r), ox * math.sin(r) + oy * math.cos(r)
            start = (p["start"][0] + ux * pb["length"] * b["at"] + ox, p["start"][1] + uy * pb["length"] * b["at"] + oy)
            parent_cum = p["cum"]
        if name in override:
            angle = override[name]
            own = angle - b["angle"] - parent_cum
        else:
            own = c["rot"]
            angle = b["angle"] + parent_cum + own
        ux, uy = _dir(angle)
        P[name] = {"start": start, "end": (start[0] + ux * b["length"], start[1] + uy * b["length"]), "angle": angle,
                   "rot": own, "cum": parent_cum + own, "sx": c["sx"], "sy": c["sy"]}

    ik_by_first = {k["bones"][0]: k for k in anim.ik}
    for name in sk.order:
        place(name)
        k = ik_by_first.get(name)
        if k:
            a_name, b_name = k["bones"]
            target = anim.sample(k["target"], t)
            first, second = two_bone(P[a_name]["start"], target, sk.bones[a_name]["length"], sk.bones[b_name]["length"], k["knee"])
            override[a_name] = first
            override[b_name] = second
            place(a_name)  # re-place with the solved angle; children come later in order
            if k.get("foot"):
                override[k["foot"]] = float(anim.sample(k["foot_angle"], t))
    return P


def all_poses(anim: Anim, n: int | None = None) -> list[dict]:
    n = n or anim.frames
    if n != anim.frames:
        anim.frames = n
    return [pose_at(anim, anim.t_of(i)) for i in range(n)]


# ---------- vẽ người que ----------
SIDE_COLORS = {"front": (225, 85, 45), "back": (55, 105, 210), "mid": (125, 125, 138)}


def draw_pose(P: dict, sk: Skeleton, scale: float, origin, size, ss: int = 3) -> Image.Image:
    """Bones as thick round-capped lines (back side first, then middle, then front), circle bones as
    discs with a dot on the facing side. Front = warm, back = cool: tells left from right at a glance."""
    W, H = size
    img = Image.new("RGBA", (W * ss, H * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    k = scale * ss
    ox, oy = origin[0] * ss, origin[1] * ss
    to = lambda p: (ox + p[0] * k, oy + p[1] * k)
    rank = {"back": 0, "mid": 1, "front": 2}
    for name in sorted(sk.order, key=lambda n: (rank.get(sk.bones[n]["side"], 1), sk.bones[n]["z"])):
        b = sk.bones[name]
        p = P[name]
        c = (b["color"] or SIDE_COLORS.get(b["side"], SIDE_COLORS["mid"])) + (255,)
        w = max(2, round(b["width"] * k))
        if b["shape"] == "circle":
            r = b["length"] / 2 * k
            cx, cy = to(((p["start"][0] + p["end"][0]) / 2, (p["start"][1] + p["end"][1]) / 2))
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)
            if b["face"]:
                fx, fy = _dir(p["angle"] + 90)  # the forward side of a bone pointing up (180 + 90 → facing right)
                d.ellipse([cx + fx * r * 0.62 - r * 0.2, cy + fy * r * 0.62 - r * 0.2, cx + fx * r * 0.62 + r * 0.2, cy + fy * r * 0.62 + r * 0.2], fill=(60, 60, 70, 255))
            continue
        a, e = to(p["start"]), to(p["end"])
        d.line([a, e], fill=c, width=w)
        for x, y in (a, e):
            d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=c)
    return resize_rgba(img, (W, H))


def _extent(P: dict, sk: Skeleton):
    xs, ys = [], []
    for n, p in P.items():
        pad = sk.bones[n]["length"] / 2 if sk.bones[n]["shape"] == "circle" else sk.bones[n]["width"]
        for x, y in (p["start"], p["end"]):
            xs += [x - pad, x + pad]
            ys += [y - pad, y + pad]
    return min(xs), max(xs), min(ys), max(ys)


def slot_scale(n: int, cell) -> int:
    return max(1, round(1536 / (cell[0] * n)))


def pose_strip(anim: Anim, cell, fill: float = 0.86) -> Image.Image:
    """One stick figure per slot, one shared scale, ground on the line at 92 % of the slot height (same
    geometry as game-raster-art `guide`/`canvas`), the skeleton's x = 0 at the slot center."""
    poses = all_poses(anim)
    n = len(poses)
    k = slot_scale(n, cell)
    cw, ch = cell[0] * k, cell[1] * k
    gy = ch * GROUND
    ext = [_extent(P, anim.skeleton) for P in poses]
    x0, x1 = min(e[0] for e in ext), max(e[1] for e in ext)
    y0 = min(e[2] for e in ext)
    scale = min(gy * fill / max(1e-6, -y0), cw * 0.5 * fill / max(1e-6, max(abs(x0), abs(x1))))
    out = Image.new("RGBA", (cw * n, ch), (246, 246, 242, 255))
    for i, P in enumerate(poses):
        out.alpha_composite(draw_pose(P, anim.skeleton, scale, (cw / 2, gy), (cw, ch)), (i * cw, 0))
    d = ImageDraw.Draw(out)
    for i in range(n + 1):
        d.line([(i * cw, 0), (i * cw, ch)], fill=(200, 200, 205, 255), width=max(2, k))
    d.line([(0, round(gy)), (cw * n, round(gy))], fill=(120, 120, 130, 255), width=max(2, k))
    return out.convert("RGB")


def preview_frames(anim: Anim, size=(256, 256)) -> list[Image.Image]:
    poses = all_poses(anim)
    W, H = size
    gy = H * GROUND
    ext = [_extent(P, anim.skeleton) for P in poses]
    x0, x1 = min(e[0] for e in ext), max(e[1] for e in ext)
    y0 = min(e[2] for e in ext)
    scale = min(gy * 0.86 / max(1e-6, -y0), W * 0.45 / max(1e-6, max(abs(x0), abs(x1))))
    frames = []
    for P in poses:
        f = Image.new("RGBA", size, (246, 246, 242, 255))
        ImageDraw.Draw(f).line([(0, round(gy)), (W, round(gy))], fill=(150, 150, 160, 255), width=2)
        f.alpha_composite(draw_pose(P, anim.skeleton, scale, (W / 2, gy), size))
        frames.append(f)
    return frames


# ---------- rig: ảnh cắt rời theo xương ----------
def _affine(img: Image.Image, canvas_size, pivot, at, angle_delta, sx, sy, ss):
    """Draw img onto a canvas (supersampled ×ss) so its pivot lands on `at`, turned clockwise by
    angle_delta and scaled by sx/sy. Forward: q = ss·(at + R·S·(p − pivot)); Pillow takes the inverse."""
    r = math.radians(angle_delta)
    c, s = math.cos(r), math.sin(r)
    sx = sx if abs(sx) > 1e-3 else 1e-3
    sy = sy if abs(sy) > 1e-3 else 1e-3
    det = sx * sy
    i00, i01, i10, i11 = c * sy / det, s * sy / det, -s * sx / det, c * sx / det
    data = (i00 / ss, i01 / ss, pivot[0] - i00 * at[0] - i01 * at[1],
            i10 / ss, i11 / ss, pivot[1] - i10 * at[0] - i11 * at[1])
    return img.convert("RGBa").transform(canvas_size, Image.Transform.AFFINE, data, resample=Image.Resampling.BICUBIC).convert("RGBA")


def load_rig(path, sk: Skeleton) -> dict:
    """rig.json: {"parts": {"<part>": {"file": "parts/x.png", "bone": "<bone>"?, "pivot": [x, y]?, "z": n?}}}.
    A part follows one bone (same name unless "bone" is given) and is drawn as painted, in the rest pose.
    Default pivot: the edge of the image the bone starts from (top-center for a bone hanging down)."""
    spec = load_json(path)
    base = Path(path).resolve().parent
    parts = {}
    for name, ps in (spec.get("parts") or {}).items():
        bone = ps.get("bone", name)
        if bone not in sk.bones:
            raise UserError(f"rig: phần '{name}' gắn vào xương '{bone}' không có trong khung xương")
        f = base / ps["file"]
        if not f.exists():
            raise UserError(f"rig: không có {ps['file']}")
        img = Image.open(f).convert("RGBA")
        bb = alpha_bbox(img)
        if bb and "pivot" not in ps:
            img = img.crop(bb)
        ux, uy = _dir(sk.bones[bone]["angle"])
        half = (abs(ux) * img.width + abs(uy) * img.height) / 2 * 0.88
        cx, cy = img.width / 2, img.height / 2
        pivot = tuple(ps["pivot"]) if "pivot" in ps else (cx - ux * half, cy - uy * half)
        end = (cx + ux * half, cy + uy * half) if "pivot" not in ps else (pivot[0] + ux * half * 2, pivot[1] + uy * half * 2)
        parts[name] = {"img": img, "bone": bone, "pivot": pivot, "len_px": math.dist(pivot, end), "z": ps.get("z")}
    if not parts:
        raise UserError("rig: không có 'parts'")
    return parts


def rig_render(anim: Anim, parts: dict, ss: int = 2) -> list[Image.Image]:
    sk = anim.skeleton
    ratios = [p["len_px"] / sk.bones[p["bone"]]["length"] for p in parts.values() if sk.bones[p["bone"]]["shape"] != "circle"]
    ppu = sorted(ratios)[len(ratios) // 2] if ratios else 50.0
    poses = all_poses(anim)
    ext = [_extent(P, sk) for P in poses]
    pad = max(max(p["img"].size) for p in parts.values())
    x0, x1 = min(e[0] for e in ext) * ppu - pad, max(e[1] for e in ext) * ppu + pad
    y0, y1 = min(e[2] for e in ext) * ppu - pad, max(0.0, max(e[3] for e in ext)) * ppu + pad
    W, H = int(x1 - x0) + 4, int(y1 - y0) + 4
    rank = {"back": 0, "mid": 1, "front": 2}
    order = sorted(parts, key=lambda n: (parts[n]["z"] if parts[n]["z"] is not None else rank.get(sk.bones[parts[n]["bone"]]["side"], 1) * 10 + sk.bones[parts[n]["bone"]]["z"]))
    frames = []
    for P in poses:
        canvas = Image.new("RGBA", (W * ss, H * ss), (0, 0, 0, 0))
        for name in order:
            pt = parts[name]
            bp = P[pt["bone"]]
            at = ((bp["start"][0] * ppu - x0), (bp["start"][1] * ppu - y0))
            delta = bp["angle"] - sk.bones[pt["bone"]]["angle"]
            # a part squashed flat (a coin edge-on) keeps a sliver instead of vanishing for a frame
            sx = math.copysign(max(abs(bp["sx"]), 0.1), bp["sx"] or 1)
            sy = math.copysign(max(abs(bp["sy"]), 0.1), bp["sy"] or 1)
            canvas.alpha_composite(_affine(pt["img"], canvas.size, pt["pivot"], at, delta, sx, sy, ss))
        frames.append(resize_rgba(canvas, (W, H)))
    return frames


def fit_slot(frames: list[Image.Image], size, pad: int = 2) -> list[Image.Image]:
    """One shared crop (union of all frames) and one shared scale: motion inside the cycle is kept."""
    boxes = [alpha_bbox(f) for f in frames]
    boxes = [b for b in boxes if b]
    if not boxes:
        raise UserError("mọi frame trống")
    u = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    W, H = size
    s = min((W - 2 * pad) / (u[2] - u[0]), (H - 2 * pad) / (u[3] - u[1]))
    out = []
    for f in frames:
        c = f.crop(u)
        c = resize_rgba(c, (max(1, round(c.width * s)), max(1, round(c.height * s))))
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        canvas.alpha_composite(c, ((W - c.width) // 2, H - pad - c.height))
        out.append(canvas)
    return out


def strip(frames):
    W, H = frames[0].size
    s = Image.new("RGBA", (W * len(frames), H), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        s.alpha_composite(f, (i * W, 0))
    return s


# ---------- kiểm, bake ----------
def check_anim(anim: Anim, max_turn: float = 100.0, max_move: float = 0.4) -> list[str]:
    """Warnings for pops: a bone turning more than max_turn degrees between neighboring frames, or the
    root moving more than max_move of the figure height; for loops the last→first seam is checked too."""
    poses = all_poses(anim)
    ext = [_extent(P, anim.skeleton) for P in poses]
    height = max(e[3] for e in ext) - min(e[2] for e in ext)
    root = anim.skeleton.root
    warn = []
    pairs = list(zip(range(len(poses)), range(1, len(poses))))
    if anim.loop and len(poses) > 1:
        pairs.append((len(poses) - 1, 0))
    for a, b in pairs:
        turn, where = 0.0, ""
        for n in poses[a]:
            if anim.skeleton.bones[n]["shape"] == "circle":
                continue
            d = abs((poses[a][n]["angle"] - poses[b][n]["angle"] + 180) % 360 - 180)
            if d > turn:
                turn, where = d, n
        if turn > max_turn:
            warn.append(f"frame {a}→{b}: '{where}' xoay {turn:.0f}° trong một frame — dễ giật; thêm frame hoặc key ở giữa")
        move = math.dist(poses[a][root]["start"], poses[b][root]["start"])
        if move > max_move * height:
            warn.append(f"frame {a}→{b}: cả người dời {move / height:.0%} chiều cao — dễ giật")
    return warn


def bake(anim: Anim) -> dict:
    out = {"fps": anim.fps, "loop": anim.loop, "frames": []}
    for P in all_poses(anim):
        out["frames"].append({n: {"x": round(p["start"][0], 4), "y": round(p["start"][1], 4), "angle": round(p["angle"], 3),
                                  "rot": round(p["rot"], 3), "sx": round(p["sx"], 4), "sy": round(p["sy"], 4)} for n, p in P.items()})
    return out


# ---------- mocap: BVH → animation (chuyển động thật) ----------
# Joint names per naming scheme → our humanoid bones. "front" = the character's LEFT side: facing right,
# a person shows their left side to the viewer.
BVH_NAMES = {
    "hips": ["Hips", "hip", "pelvis", "Pelvis"],
    "neck": ["Neck", "neck", "lowerneck", "Neck1"],
    "head": ["Head", "head"],
    "shoulder_front": ["LeftArm", "LeftShoulder", "lShldr", "LeftUpArm"], "elbow_front": ["LeftForeArm", "LeftElbow", "lForeArm"],
    "wrist_front": ["LeftHand", "LeftWrist", "lHand"],
    "shoulder_back": ["RightArm", "RightShoulder", "rShldr", "RightUpArm"], "elbow_back": ["RightForeArm", "RightElbow", "rForeArm"],
    "wrist_back": ["RightHand", "RightWrist", "rHand"],
    "hip_front": ["LeftUpLeg", "LeftHip", "lThigh"], "knee_front": ["LeftLeg", "LeftKnee", "lShin"],
    "ankle_front": ["LeftFoot", "LeftAnkle", "lFoot"], "toe_front": ["LeftToeBase", "LeftToe", "lToe"],
    "hip_back": ["RightUpLeg", "RightHip", "rThigh"], "knee_back": ["RightLeg", "RightKnee", "rShin"],
    "ankle_back": ["RightFoot", "RightAnkle", "rFoot"], "toe_back": ["RightToeBase", "RightToe", "rToe"],
}


def _rotm(axis, deg):
    r = math.radians(deg)
    c, s = math.cos(r), math.sin(r)
    if axis == "X":
        return ((1, 0, 0), (0, c, -s), (0, s, c))
    if axis == "Y":
        return ((c, 0, s), (0, 1, 0), (-s, 0, c))
    return ((c, -s, 0), (s, c, 0), (0, 0, 1))


def _mm(a, b):
    return tuple(tuple(sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)) for i in range(3))


def _mv(a, v):
    return tuple(sum(a[i][k] * v[k] for k in range(3)) for i in range(3))


def parse_bvh(path):
    """Joints (name, parent, offset, channels, end site) and frames of channel values."""
    text = Path(path).read_text(encoding="utf-8", errors="replace").split()
    joints, stack, i = [], [], 0
    while text[i] != "MOTION":
        tok = text[i]
        if tok in ("ROOT", "JOINT"):
            joints.append({"name": text[i + 1], "parent": stack[-1] if stack else None, "offset": (0, 0, 0), "channels": [], "end": None})
            i += 2
        elif tok == "End":
            i += 2
            assert text[i] == "{"
            j = joints[stack[-1]]
            j["end"] = tuple(float(v) for v in text[i + 2:i + 5])
            i += 6
        elif tok == "{":
            stack.append(len(joints) - 1)
            i += 1
        elif tok == "}":
            stack.pop()
            i += 1
        elif tok == "OFFSET":
            joints[stack[-1]]["offset"] = tuple(float(v) for v in text[i + 1:i + 4])
            i += 4
        elif tok == "CHANNELS":
            n = int(text[i + 1])
            joints[stack[-1]]["channels"] = text[i + 2:i + 2 + n]
            i += 2 + n
        else:
            i += 1
    n_frames = int(text[i + 2])
    dt = float(text[i + 5])
    vals = [float(v) for v in text[i + 6:]]
    width = sum(len(j["channels"]) for j in joints)
    frames = [vals[k * width:(k + 1) * width] for k in range(n_frames)]
    return joints, frames, dt


def bvh_positions(joints, frame):
    """World position of every joint (and of end sites as '<name>_end') for one frame."""
    pos, rot, k = {}, {}, 0
    for idx, j in enumerate(joints):
        t = list(j["offset"])
        r = ((1, 0, 0), (0, 1, 0), (0, 0, 1))
        for ch in j["channels"]:
            v = frame[k]
            k += 1
            if ch.endswith("position"):
                t["XYZ".index(ch[0])] = v
            else:
                r = _mm(r, _rotm(ch[0], v))
        if j["parent"] is None:
            pos[idx], rot[idx] = tuple(t), r
        else:
            pr, pp = rot[j["parent"]], pos[j["parent"]]
            o = _mv(pr, t)
            pos[idx] = (pp[0] + o[0], pp[1] + o[1], pp[2] + o[2])
            rot[idx] = _mm(pr, r)
        if j["end"]:
            o = _mv(rot[idx], j["end"])
            pos[f"{idx}_end"] = (pos[idx][0] + o[0], pos[idx][1] + o[1], pos[idx][2] + o[2])
    return pos


def bvh_to_anim(path, skeleton: str = "humanoid.skeleton.json", start: int = 0, end: int | None = None, keys: int = 24,
                frames: int = 8, fps: float | None = None, loop: bool = True, in_place: bool = True, flip: bool = False,
                sk: Skeleton | None = None) -> dict:
    """Side view of a BVH clip on a humanoid skeleton (bones torso, head, arm_*, forearm_*, thigh_*, shin_*, foot_*):
    body and arms as rotation keys, legs as IK targets so the feet land where the actor's did."""
    joints, data, dt = parse_bvh(path)
    sk = sk or load_skeleton(LIBRARY / "humanoid" / "humanoid.skeleton.json")
    need = [b for b in ("torso", "head", "thigh_front", "shin_front", "thigh_back", "shin_back") if b not in sk.bones]
    if need:
        raise UserError(f"khung xương thiếu xương {', '.join(need)} — mocap cần khung kiểu humanoid")
    names = {j["name"]: i for i, j in enumerate(joints)}

    def find(role):
        for n in BVH_NAMES[role]:
            if n in names:
                return names[n]
        return None
    roles = {r: find(r) for r in BVH_NAMES}
    missing = [r for r in ("hips", "neck", "hip_front", "knee_front", "ankle_front", "hip_back", "knee_back", "ankle_back") if roles[r] is None]
    if missing:
        raise UserError(f"BVH thiếu khớp cho {', '.join(missing)} — tên khớp có: {', '.join(list(names)[:20])}…")
    head_end = f"{roles['head']}_end" if roles["head"] is not None and joints[roles["head"]]["end"] else roles["head"] or roles["neck"]
    end = len(data) if end is None else min(end, len(data))
    if end - start < 2:
        raise UserError(f"đoạn {start}–{end} quá ngắn (BVH có {len(data)} frame)")
    P = [bvh_positions(joints, data[f]) for f in range(start, end)]
    sub = lambda a, b: (a[0] - b[0], a[1] - b[1], a[2] - b[2])
    dot = lambda a, b: a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    norm = lambda a: (lambda l: (a[0] / l, a[1] / l, a[2] / l))(math.sqrt(dot(a, a)) or 1)
    # up: the world axis (BVH files are Y-up or Z-up) closest to hips → neck; a leaning spine must not tilt it,
    # or travel leaks into height. forward: toes ahead of ankles, flattened onto the ground plane
    spine = norm(tuple(sum(sub(p[roles["neck"]], p[roles["hips"]])[i] for p in P) for i in range(3)))
    ax = max(range(3), key=lambda i: abs(spine[i]))
    up = tuple((1.0 if spine[ax] > 0 else -1.0) if i == ax else 0.0 for i in range(3))
    fw = (0.0, 0.0, 0.0)
    for side in ("front", "back"):
        if roles[f"toe_{side}"] is not None:
            fw = tuple(fw[i] + sum(sub(p[roles[f"toe_{side}"]], p[roles[f"ankle_{side}"]])[i] for p in P) for i in range(3))
    if dot(fw, fw) < 1e-9:  # no toes: use the direction the hips travel
        fw = sub(P[-1][roles["hips"]], P[0][roles["hips"]])
    fw = norm(tuple(fw[i] - dot(fw, up) * up[i] for i in range(3)))
    if flip:
        fw = (-fw[0], -fw[1], -fw[2])
    leg = sum(math.dist(p[roles["hip_front"]], p[roles["knee_front"]]) + math.dist(p[roles["knee_front"]], p[roles["ankle_front"]]) for p in P) / len(P)
    s = (sk.bones["thigh_front"]["length"] + sk.bones["shin_front"]["length"]) / leg  # the actor's leg → ours
    to2 = lambda v: (dot(v, fw) * s, -dot(v, up) * s)
    pts = [{r: to2(p[i]) for r, i in roles.items() if i is not None} | {"head_end": to2(p[head_end])} for p in P]
    ground = max(max(q["ankle_front"][1], q["ankle_back"][1]) for q in pts)
    for q in pts:
        for r in q:
            q[r] = (q[r][0], q[r][1] - ground)
    # in place: remove the travel of the hips so the animation stays put (the game moves the character).
    # A loop loses only its steady drift (the hips still surge within a step); a one-shot move (jump, lunge)
    # travels unevenly, so its hips are held at x = 0 throughout
    if in_place:
        n = len(pts)
        x0, x1 = pts[0]["hips"][0], pts[-1]["hips"][0]
        for k, q in enumerate(pts):
            shift = x0 + (x1 - x0) * k / max(1, n - 1) if loop else q["hips"][0]
            for r in q:
                q[r] = (q[r][0] - shift, q[r][1])
    if loop:  # start the loop where the front foot reaches furthest ahead (heel strike), like the hand-keyed cycles
        k0 = max(range(len(pts)), key=lambda k: pts[k]["ankle_front"][0] - pts[k]["hips"][0])
        pts = pts[k0:] + pts[:k0]
    rest_y = sk.root_pos[1]
    ang = lambda a, b: _ang(b[0] - a[0], b[1] - a[1])
    out_keys = {"torso": {"x": [], "y": [], "rot": []}, "head": {"rot": []}}
    for side in ("front", "back"):
        out_keys[f"arm_{side}"] = {"rot": []}
        out_keys[f"forearm_{side}"] = {"rot": []}
    ik = {side: {"target": [], "foot_angle": []} for side in ("front", "back")}

    def unwrap(prev, a):
        while prev is not None and a - prev > 180:
            a -= 360
        while prev is not None and a - prev < -180:
            a += 360
        return a
    # a limb pointing at the camera projects short and its side-view angle spins; trust the angle only as much
    # as the limb shows its length (longest projection over the clip ≈ the real length)
    seg = {}
    for side in ("front", "back"):
        if roles[f"elbow_{side}"] is not None and roles[f"wrist_{side}"] is not None:
            seg[f"arm_{side}"] = (f"shoulder_{side}", f"elbow_{side}")
            seg[f"forearm_{side}"] = (f"elbow_{side}", f"wrist_{side}")
    full = {b: max(math.dist(q[a], q[c]) for q in pts) or 1 for b, (a, c) in seg.items()}
    last = {}
    for k in range(keys):
        t = k / keys if loop else k / max(1, keys - 1)
        f = min(len(pts) - 1, round(t * (len(pts) - (0 if loop else 1))) if not loop else int(t * len(pts)))
        q = pts[f]
        hip = ((q["hip_front"][0] + q["hip_back"][0]) / 2, (q["hip_front"][1] + q["hip_back"][1]) / 2)
        torso_w = ang(hip, q["neck"])
        vals = {"torso": torso_w - 180}
        vals["head"] = ang(q["neck"], q["head_end"]) - 180 - vals["torso"]
        for side in ("front", "back"):
            if roles[f"elbow_{side}"] is not None and roles[f"wrist_{side}"] is not None:
                sh = q[f"shoulder_{side}"]
                aw = ang(sh, q[f"elbow_{side}"])
                fw_ = ang(q[f"elbow_{side}"], q[f"wrist_{side}"])
                vals[f"arm_{side}"] = aw - vals["torso"]
                vals[f"forearm_{side}"] = fw_ - aw
        for name in list(vals):
            vals[name] = unwrap(last.get(name), vals[name])
            if name in seg and name in last:
                shown = math.dist(q[seg[name][0]], q[seg[name][1]]) / full[name]
                vals[name] = last[name] + (vals[name] - last[name]) * min(1.0, shown / 0.6)
            last[name] = vals[name]
        out_keys["torso"]["x"].append([round(t, 4), round(hip[0], 4), "linear"])
        out_keys["torso"]["y"].append([round(t, 4), round(hip[1] - rest_y, 4), "linear"])
        out_keys["torso"]["rot"].append([round(t, 4), round(vals["torso"], 3), "linear"])
        out_keys["head"]["rot"].append([round(t, 4), round(vals["head"], 3), "linear"])
        for side in ("front", "back"):
            for b in ("arm", "forearm"):
                if f"{b}_{side}" in vals:
                    out_keys[f"{b}_{side}"]["rot"].append([round(t, 4), round(vals[f"{b}_{side}"], 3), "linear"])
            a = q[f"ankle_{side}"]
            # IK target relative to OUR hip: keep the mocap leg pose but on our leg lengths
            ik[side]["target"].append([round(t, 4), [round(a[0], 4), round(a[1], 4)], "linear"])
            if roles[f"toe_{side}"] is not None:
                fa = ang(a, q[f"toe_{side}"])
                # our ankle stands on the ground (the actor's floats a few cm up): tilt the foot up just enough
                # that its tip never sinks below y = 0
                flen = sk.bones[f"foot_{side}"]["length"] if f"foot_{side}" in sk.bones else 0
                if flen and a[1] + flen * math.cos(math.radians(fa)) > 0:
                    fa = -math.degrees(math.acos(max(-1.0, min(1.0, -a[1] / flen))))
                ik[side]["foot_angle"].append([round(t, 4), round(fa, 3), "linear"])
    out_keys = {b: {c: v for c, v in ch.items() if v} for b, ch in out_keys.items()}
    out_keys = {b: ch for b, ch in out_keys.items() if ch}
    return {"note": f"mocap từ {Path(path).name} (frame {start}–{end})", "skeleton": skeleton, "frames": frames,
            "fps": fps or round(frames / ((end - start) * dt), 2), "loop": loop, "keys": out_keys,
            "ik": [{"bones": [f"thigh_{s_}", f"shin_{s_}"], "knee": "forward", "target": ik[s_]["target"],
                    **({"foot": f"foot_{s_}", "foot_angle": ik[s_]["foot_angle"]} if ik[s_]["foot_angle"] else {})} for s_ in ("front", "back")]}


def find_cycle(path, min_len: float = 0.5, max_len: float = 2.0, start: int = 0, end: int | None = None):
    """Best loop: among windows that move at least half as much as the liveliest one, the frame pair (i, i + P)
    whose limb poses (relative to the hips) match most closely."""
    joints, data, dt = parse_bvh(path)
    names = {j["name"]: i for i, j in enumerate(joints)}
    pick = [names[n] for role in ("ankle_front", "ankle_back", "knee_front", "knee_back", "wrist_front", "wrist_back")
            for n in BVH_NAMES[role] if n in names][:6]
    hips = next(names[n] for n in BVH_NAMES["hips"] if n in names)
    end = len(data) if end is None else min(end, len(data))
    step = max(1, round(1 / 30 / dt))
    idx = list(range(start, end, step))
    feats = []
    for f in idx:
        p = bvh_positions(joints, data[f])
        h = p[hips]
        feats.append([c for j in pick for c in (p[j][0] - h[0], p[j][1] - h[1], p[j][2] - h[2])])
    lo, hi = max(2, round(min_len / (dt * step))), round(max_len / (dt * step))
    # a standing-still stretch matches itself perfectly: score the seam against how much the limbs move inside
    # the window, and skip windows that hardly move at all
    spread = lambda fs: sum(math.dist(f, [sum(c) / len(fs) for c in zip(*fs)]) for f in fs) / len(fs)
    moves = {(a, a + P_): spread(feats[a:a + P_]) for a in range(len(feats)) for P_ in range(lo, min(hi, len(feats) - 1 - a) + 1)}
    top = max((v for v in moves.values()), default=0)
    if top <= 0:
        raise UserError("đoạn mocap quá ngắn hoặc không có chuyển động để tìm vòng lặp")
    best = None
    for (a, b), m in moves.items():
        if m >= 0.5 * top:
            d = math.dist(feats[a], feats[b]) / m
            if best is None or d < best[0]:
                best = (d, idx[a], idx[b])
    return best[1], best[2], dt


# ---------- CLI ----------
def list_library() -> list[str]:
    return sorted(str(p.relative_to(LIBRARY)).replace("\\", "/").removesuffix(".anim.json") for p in LIBRARY.rglob("*.anim.json"))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="animate", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("library")
    p = sub.add_parser("new"); p.add_argument("template", help="vd humanoid/walk"); p.add_argument("--out", required=True)
    p = sub.add_parser("preview"); p.add_argument("anim"); p.add_argument("--out", required=True)
    p.add_argument("--frames", type=int); p.add_argument("--size", default="256x256")
    p = sub.add_parser("pose"); p.add_argument("anim"); p.add_argument("--cell", required=True); p.add_argument("--out", required=True)
    p.add_argument("--frames", type=int)
    for cmd in ("rig", "tween"):
        p = sub.add_parser(cmd); p.add_argument("rig" if cmd == "rig" else "sprite"); p.add_argument("--anim", required=True)
        p.add_argument("--size", required=True); p.add_argument("--out", required=True); p.add_argument("--frames", type=int)
        p.add_argument("--gif"); p.add_argument("--frames-dir"); p.add_argument("--pad", type=int, default=2)
    p = sub.add_parser("mocap"); p.add_argument("bvh"); p.add_argument("--out", required=True)
    p.add_argument("--start", type=int, default=0); p.add_argument("--end", type=int)
    p.add_argument("--cycle", action="store_true", help="tự tìm một vòng lặp khớp nhất trong đoạn")
    p.add_argument("--once", action="store_true", help="động tác một lần (không lặp)")
    p.add_argument("--frames", type=int, default=8); p.add_argument("--keys", type=int, default=24)
    p.add_argument("--keep-travel", action="store_true", help="giữ quãng đường đi (mặc định: tại chỗ)")
    p.add_argument("--flip", action="store_true", help="lật hướng mặt nếu nhân vật quay ngược")
    p.add_argument("--skeleton", default="humanoid.skeleton.json", help="khung humanoid, tính từ thư mục --out (vd humanoid-chibi.skeleton.json)")
    p = sub.add_parser("check"); p.add_argument("anim")
    p = sub.add_parser("bake"); p.add_argument("anim"); p.add_argument("--out", required=True); p.add_argument("--frames", type=int)
    a = ap.parse_args(argv)
    try:
        if a.cmd == "library":
            for name in list_library():
                an = load_anim(LIBRARY / f"{name}.anim.json")
                print(f"{name:24} {an.frames} frame, {'lặp' if an.loop else 'một lần'} — {an.data.get('note', '')}")
        elif a.cmd == "new":
            src = LIBRARY / f"{a.template}.anim.json"
            if not src.exists():
                raise UserError(f"không có mẫu '{a.template}'. Có: {', '.join(list_library())}")
            out = Path(a.out)
            out.mkdir(parents=True, exist_ok=True)
            data = load_json(src)
            sk_name = data["skeleton"] if isinstance(data.get("skeleton"), str) else None
            dst = out / src.name
            if sk_name:
                sk_src = src.parent / sk_name
                if not (out / Path(sk_name).name).exists():
                    shutil.copy(sk_src, out / Path(sk_name).name)
                data["skeleton"] = Path(sk_name).name
            dst.write_text(dump_json(data), encoding="utf-8")
            print(f"✔ {dst}" + (f" + {out / Path(sk_name).name}" if sk_name else "") + " — sửa rồi `preview` để xem")
        elif a.cmd == "preview":
            an = load_anim(a.anim)
            if a.frames:
                an.frames = a.frames
            frames = preview_frames(an, parse_size(a.size))
            if a.out.lower().endswith(".gif"):
                save_gif(frames, a.out, an.fps)
            else:
                save(strip(frames), a.out)
            print(f"✔ {a.out} ({len(frames)} frame, {an.fps:g} fps)")
            for w in check_anim(an):
                print(f"⚠ {w}")
        elif a.cmd == "pose":
            an = load_anim(a.anim)
            if a.frames:
                an.frames = a.frames
            img = pose_strip(an, parse_size(a.cell))
            save(img, a.out)
            print(f"✔ {a.out} {img.width}×{img.height}: {an.frames} tư thế — phía TRƯỚC màu cam-đỏ, phía SAU màu xanh")
        elif a.cmd in ("rig", "tween"):
            an = load_anim(a.anim)
            if a.frames:
                an.frames = a.frames
            if an.frames < 2:
                raise UserError("animation cần ≥ 2 frame")
            if a.cmd == "rig":
                parts = load_rig(a.rig, an.skeleton)
            else:
                img = Image.open(a.sprite).convert("RGBA") if Path(a.sprite).exists() else None
                if img is None:
                    raise UserError(f"Không có {a.sprite}")
                bb = alpha_bbox(img)
                if not bb:
                    raise UserError("sprite trống — cần ảnh đã tách nền")
                img = img.crop(bb)
                root = an.skeleton.root
                rb = an.skeleton.bones[root]
                ux, uy = _dir(rb["angle"])
                piv = (img.width / 2, img.height / 2) if an.pivot == "center" else (img.width / 2, img.height)
                if an.pivot != "center" and abs(uy) > 0.5:  # a vertical root starts at the sprite's base
                    piv = (img.width / 2, img.height if uy < 0 else 0)
                ratio = img.height / rb["length"] if abs(uy) >= abs(ux) else img.width / rb["length"]
                parts = {"sprite": {"img": img, "bone": root, "pivot": piv, "len_px": rb["length"] * ratio, "z": 0}}
            raw = rig_render(an, parts)
            frames = fit_slot(raw, parse_size(a.size), a.pad)
            out = strip(frames)
            save(out, a.out)
            if a.frames_dir:
                for i, f in enumerate(frames):
                    save(f, Path(a.frames_dir) / f"{Path(a.out).stem}_{i:02d}.png")
            if a.gif:
                save_gif(frames, a.gif, an.fps)
            print(f"✔ {a.out} {out.width}×{out.height} ({an.frames} frame, {len(parts)} phần)")
        elif a.cmd == "mocap":
            start, end = a.start, a.end
            if a.cycle:
                start, end, dt = find_cycle(a.bvh, start=a.start, end=a.end)
                print(f"vòng lặp: frame {start}–{end} ({(end - start) * dt:.2f} giây)")
            out_dir = Path(a.out).parent
            out_dir.mkdir(parents=True, exist_ok=True)
            sk_path = out_dir / a.skeleton
            if not sk_path.exists():  # a library skeleton: copy it next to the animation, as `new` does
                lib = LIBRARY / "humanoid" / Path(a.skeleton).name
                if not lib.exists():
                    raise UserError(f"không thấy khung xương {sk_path} (hoặc {Path(a.skeleton).name} trong thư viện humanoid)")
                shutil.copy(lib, out_dir / lib.name)
                sk_path = out_dir / lib.name
            data = bvh_to_anim(a.bvh, sk_path.name if sk_path.parent == out_dir else str(sk_path), start, end, a.keys,
                               a.frames, None, not a.once, not a.keep_travel, a.flip, load_skeleton(sk_path))
            Path(a.out).write_text(dump_json(data), encoding="utf-8")
            print(f"✔ {a.out} ({data['frames']} frame, {data['fps']} fps, {'lặp' if data['loop'] else 'một lần'}) — `preview` để xem, sửa key nếu cần")
        elif a.cmd == "check":
            an = load_anim(a.anim)
            ws = check_anim(an)
            for w in ws:
                print(f"⚠ {w}")
            print(f"✔ {a.anim}: {len(an.skeleton.bones)} xương, {an.frames} frame, {len(an.keys)} xương có key, "
                  f"{len(an.waves)} sóng, {len(an.ik)} IK" + (" — có chỗ giật" if ws else ""))
            return 1 if ws else 0
        elif a.cmd == "bake":
            an = load_anim(a.anim)
            if a.frames:
                an.frames = a.frames
            Path(a.out).parent.mkdir(parents=True, exist_ok=True)
            Path(a.out).write_text(json.dumps(bake(an), indent=1), encoding="utf-8")
            print(f"✔ {a.out} ({an.frames} frame × {len(an.skeleton.bones)} xương)")
    except UserError as e:
        print(f"✖ {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
