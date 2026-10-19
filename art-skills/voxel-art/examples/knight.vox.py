# Hiệp sĩ chibi: đầu to, mũ có chỏm, khiên. Vẽ nửa trái rồi mirror_x, sau đó thêm chi tiết lệch.
PALETTE = {
    "s": "#f2c79a",  # da
    "a": "#b8c4d6", "A": "#7d8aa3",  # giáp sáng/tối
    "r": "#d9483b",  # chỏm mũ, áo
    "k": "#23202e",  # mắt, khe mũ
    "b": "#6b4426",  # giày
    "y": "#f4c542",  # viền khiên
}
SIZE = (12, 10, 18)


def build(v):
    v.box(3, 3, 0, 5, 6, 2, "b")             # chân trái (mirror ra chân phải)
    v.box(2, 2, 2, 6, 7, 7, "a")              # thân
    v.box(2, 2, 5, 6, 3, 6, "A")              # đai
    v.box(1, 3, 3, 2, 6, 6, "a")              # tay
    v.box(1, 1, 7, 6, 9, 14, "a")             # mũ (đầu to)
    v.box(2, 0, 9, 6, 1, 12, "s")             # mặt trước
    v.mirror_x()
    v.box(3, 0, 10, 9, 1, 11, "k")            # khe mũ
    v.set(4, 0, 10, "s"); v.set(7, 0, 10, "s")
    v.box(5, 3, 14, 7, 7, 17, "r")            # chỏm
    v.box(10, 2, 2, 12, 8, 8, "y")            # khiên bên phải
    v.box(11, 3, 3, 12, 7, 7, "r")
