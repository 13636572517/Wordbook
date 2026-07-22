"""生成 3 款 PWA 图标候选方案（1024x1024）。

方案一「墨金印章」：黑底 + 宋体金字「词」，极简奢华
方案二「黄金卡片」：黑底 + 金色闪卡堆叠，卡片上是「词」
方案三「晨金渐变」：金色渐变底 + 黑字「擎」，温暖有活力

用法：python3 scripts/gen-icon-candidates.py
输出：assets/icon-candidates/icon-{1,2,3}.png + compare.png
"""

from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
OUT_DIR = "assets/icon-candidates"

GOLD = "#D4A853"
GOLD_LIGHT = "#F0CE8A"
GOLD_DARK = "#B9863C"
BLACK = "#0D0D0D"
CARD_DARK = "#17130D"

SONGTI = "/System/Library/Fonts/Songti.ttc"
HEITI = "/System/Library/Fonts/STHeiti Medium.ttc"


def rounded_mask(size: int, radius: int) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius, fill=255)
    return m


def vertical_gradient(size: int, top: str, bottom: str) -> Image.Image:
    tr, tg, tb = (int(top[i:i + 2], 16) for i in (1, 3, 5))
    br, bg, bb = (int(bottom[i:i + 2], 16) for i in (1, 3, 5))
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        r = int(tr + (br - tr) * t)
        g = int(tg + (bg - tg) * t)
        b = int(tb + (bb - tb) * t)
        for x in range(size):
            px[x, y] = (r, g, b)
    return img


def radial_glow(size: int, base: str, glow: str, cx: int, cy: int, radius: int) -> Image.Image:
    """在 base 底色上叠加中心光晕。"""
    br, bg_, bb = (int(base[i:i + 2], 16) for i in (1, 3, 5))
    gr, gg, gb = (int(glow[i:i + 2], 16) for i in (1, 3, 5))
    img = Image.new("RGB", (size, size), (br, bg_, bb))
    px = img.load()
    for y in range(size):
        for x in range(size):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if d < radius:
                t = (1 - d / radius) ** 2 * 0.55
                px[x, y] = (
                    int(br + (gr - br) * t),
                    int(bg_ + (gg - bg_) * t),
                    int(bb + (gb - bb) * t),
                )
    return img


def draw_text_centered(
    img: Image.Image, text: str, font: ImageFont.FreeTypeFont,
    fill: str, cy: int | None = None, cx: int | None = None,
) -> None:
    d = ImageDraw.Draw(img)
    bbox = d.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = (SIZE - w) // 2 - bbox[0] if cx is None else cx - w // 2 - bbox[0]
    y = (SIZE - h) // 2 - bbox[1] if cy is None else cy - h // 2 - bbox[1]
    d.text((x, y), text, font=font, fill=fill)


def icon1() -> Image.Image:
    """方案一「墨金印章」：黑底宋体金字「词」+ 金色印点。"""
    bg = radial_glow(SIZE, BLACK, "#241D10", SIZE // 2, SIZE // 2 - 40, 680)
    img = bg.convert("RGBA")
    font = ImageFont.truetype(SONGTI, 600, index=0)
    draw_text_centered(img, "词", font, GOLD, cy=SIZE // 2 + 10)
    # 右上角金色印点
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([790, 148, 876, 234], radius=18, fill=GOLD)
    return img


def icon2() -> Image.Image:
    """方案二「黄金卡片」：深色底 + 金色闪卡堆叠。"""
    img = Image.new("RGBA", (SIZE, SIZE), "#131009")
    d = ImageDraw.Draw(img)

    # 后卡片（旋转）
    back = Image.new("RGBA", (620, 440), (0, 0, 0, 0))
    bd = ImageDraw.Draw(back)
    bd.rounded_rectangle([0, 0, 619, 439], radius=56, fill="#2A2213", outline=GOLD_DARK, width=10)
    back = back.rotate(-10, expand=True, resample=Image.BICUBIC)
    img.paste(back, (235, 205), back)

    # 前卡片
    front = Image.new("RGBA", (620, 440), (0, 0, 0, 0))
    fd = ImageDraw.Draw(front)
    fd.rounded_rectangle([0, 0, 619, 439], radius=56, fill=CARD_DARK, outline=GOLD, width=14)
    front = front.rotate(6, expand=True, resample=Image.BICUBIC)
    img.paste(front, (160, 300), front)

    # 前卡片上的「词」（随卡片同角度合成）
    char_layer = Image.new("RGBA", front.size, (0, 0, 0, 0))
    font = ImageFont.truetype(HEITI, 280, index=0)
    cdraw = ImageDraw.Draw(char_layer)
    bbox = cdraw.textbbox((0, 0), "词", font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    cdraw.text(
        ((front.size[0] - w) // 2 - bbox[0], (front.size[1] - h) // 2 - bbox[1] - 10),
        "词", font=font, fill=GOLD,
    )
    comp = Image.alpha_composite(Image.new("RGBA", front.size, (0, 0, 0, 0)), front)
    comp = Image.alpha_composite(comp, char_layer)
    img.paste(comp, (160, 300), comp)
    return img


def icon3() -> Image.Image:
    """方案三「晨金渐变」：金色渐变底 + 黑字「擎」。"""
    bg = vertical_gradient(SIZE, GOLD_LIGHT, GOLD_DARK)
    img = bg.convert("RGBA")
    # 顶部柔光
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-200, -420, SIZE + 200, 360], fill=(255, 255, 255, 70))
    img = Image.alpha_composite(img, glow)
    font = ImageFont.truetype(HEITI, 580, index=0)
    draw_text_centered(img, "擎", font, BLACK, cy=SIZE // 2 + 30)
    return img


def compose_compare(icons: list[Image.Image]) -> Image.Image:
    """三图横排对比，带中文标签。"""
    scale = 480
    gap = 60
    label_h = 110
    w = scale * 3 + gap * 4
    h = scale + gap * 2 + label_h
    canvas = Image.new("RGB", (w, h), "#1A1A1A")
    d = ImageDraw.Draw(canvas)
    font = ImageFont.truetype(HEITI, 52, index=0)
    names = ["方案一 · 墨金印章「词」", "方案二 · 黄金卡片「词」", "方案三 · 晨金渐变「擎」"]
    for i, (ic, name) in enumerate(zip(icons, names)):
        small = ic.convert("RGB").resize((scale, scale), Image.LANCZOS)
        x = gap + i * (scale + gap)
        y = gap
        canvas.paste(small, (x, y))
        bbox = d.textbbox((0, 0), name, font=font)
        tw = bbox[2] - bbox[0]
        d.text((x + (scale - tw) // 2, y + scale + 24), name, font=font, fill="#E8E0D4")
    return canvas


def main() -> None:
    import os
    os.makedirs(OUT_DIR, exist_ok=True)

    mask = rounded_mask(SIZE, 230)
    icons = []
    for i, gen in enumerate([icon1, icon2, icon3], start=1):
        img = gen()
        # 应用圆角（透明背景）
        out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        out.save(f"{OUT_DIR}/icon-{i}.png")
        icons.append(out)
        print(f"✅ {OUT_DIR}/icon-{i}.png")

    compose_compare(icons).save(f"{OUT_DIR}/compare.png")
    print(f"✅ {OUT_DIR}/compare.png")


if __name__ == "__main__":
    main()
