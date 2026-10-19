# Cây thông: thân + 3 tầng lá thu nhỏ dần, lá có đốm sáng tối.
PALETTE = {"t": "#7a4b2a", "T": "#5c371d", "g": "#4f9d4a", "G": "#3a7a3a", "l": "#7cc36a"}
SIZE = (13, 13, 22)


def build(v):
    v.cylinder(6.5, 6.5, 0, 6, 1.6, "t")
    for z0, r in ((5, 6.2), (10, 4.8), (14, 3.4)):
        for dz in range(5):
            v.cylinder(6.5, 6.5, z0 + dz, z0 + dz + 1, r * (1 - dz / 6), "g")
    v.box(6, 6, 19, 7, 7, 21, "g")
    v.speckle("g", "G", 0.25, seed=3)
    v.speckle("g", "l", 0.12, seed=7)
