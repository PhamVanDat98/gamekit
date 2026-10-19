# Thùng gỗ: hộp rỗng, ván ngang và nẹp góc tối.
PALETTE = {"w": "#c98a52", "W": "#9a6334", "d": "#6e4424"}
SIZE = (10, 10, 10)


def build(v):
    v.box(0, 0, 0, 10, 10, 10, "w", hollow=True)
    for z in (0, 3, 6, 9):
        v.recolor("w", "W", where=lambda x, y, zz, z=z: zz == z)
    for x, y in ((0, 0), (9, 0), (0, 9), (9, 9)):
        v.box(x, y, 0, x + 1, y + 1, 10, "d")
    for (x, y, z) in list(v.v):
        if z == 9 and 0 < x < 9 and 0 < y < 9 and (x + y) % 3 == 0:
            v.set(x, y, z, "W")
