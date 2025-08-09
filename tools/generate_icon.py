from __future__ import annotations

import os
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSETS_DIR = PROJECT_ROOT / "assets"
ICONSET_DIR = ASSETS_DIR / "MarkWrite.iconset"
ICNS_PATH = ASSETS_DIR / "MarkWrite.icns"
BASE_PNG = ASSETS_DIR / "icon_1024.png"


def ensure_dirs() -> None:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    ICONSET_DIR.mkdir(parents=True, exist_ok=True)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def lerp_color(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return (
        int(lerp(c1[0], c2[0], t)),
        int(lerp(c1[1], c2[1], t)),
        int(lerp(c1[2], c2[2], t)),
    )


def draw_gradient(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    """Create a vertical gradient image."""
    img = Image.new("RGB", (size, size), bottom)
    draw = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        color = lerp_color(top, bottom, t)
        draw.line([(0, y), (size, y)], fill=color)
    return img


def draw_m_logo_onto(img: Image.Image, size: int, color: tuple[int, int, int]) -> None:
    """Draw a stylized 'M' using vertical bars and thick diagonals."""
    w = h = size
    margin = int(0.18 * w)
    bar_w = max(12, int(0.11 * w))

    # Shadow layer
    shadow_offset = int(max(2, size * 0.01))
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    _draw_m_paths(sdraw, w, h, margin, bar_w, (0, 0, 0, 180))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=int(max(1, size * 0.02))))

    # Base layer
    base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(base)
    _draw_m_paths(bdraw, w, h, margin - shadow_offset, bar_w, (*color, 255))

    # Composite onto original image
    img.alpha_composite(shadow)
    img.alpha_composite(base)


def _draw_m_paths(draw: ImageDraw.ImageDraw, w: int, h: int, margin: int, bar_w: int, fill_rgba: tuple[int, int, int, int]) -> None:
    # Vertical bars
    draw.rectangle([margin, margin, margin + bar_w, h - margin], fill=fill_rgba)
    draw.rectangle([w - margin - bar_w, margin, w - margin, h - margin], fill=fill_rgba)

    # Diagonal strokes to form 'M'
    apex_left = (margin + bar_w, margin)
    apex_right = (w - margin - bar_w, margin)
    valley = (w // 2, h - margin)

    # Use thick lines to draw diagonals
    draw.line([apex_left, valley], fill=fill_rgba, width=bar_w, joint="curve")
    draw.line([apex_right, valley], fill=fill_rgba, width=bar_w, joint="curve")


def generate_base_png(size: int = 1024) -> Image.Image:
    # Cool blue gradient
    top = (96, 168, 255)   # #60A8FF
    bottom = (33, 58, 143) # #213A8F
    img = draw_gradient(size, top, bottom).convert("RGBA")

    # Subtle vignette
    vignette = Image.new("L", (size, size), 0)
    vg = ImageDraw.Draw(vignette)
    vg.ellipse((-int(size*0.2), -int(size*0.2), int(size*1.2), int(size*1.2)), fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(radius=int(size * 0.1)))
    img.putalpha(255)
    dark = Image.new("RGBA", (size, size), (0, 0, 0, 120))
    mask = ImageOps.invert(vignette)
    img = Image.composite(dark, img, mask)

    # Draw logo
    draw_m_logo_onto(img, size, (255, 255, 255))
    return img


def save_iconset_from_base(base: Image.Image) -> None:
    sizes = {
        "icon_16x16.png": 16,
        "icon_16x16@2x.png": 32,
        "icon_32x32.png": 32,
        "icon_32x32@2x.png": 64,
        "icon_128x128.png": 128,
        "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256,
        "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512,
        "icon_512x512@2x.png": 1024,
    }
    for name, size in sizes.items():
        out = ICONSET_DIR / name
        img = base.resize((size, size), Image.LANCZOS)
        img.save(out, format="PNG")


def build_icns() -> None:
    # Use iconutil (macOS) to compile .iconset into .icns
    os.system(f"iconutil -c icns '{ICONSET_DIR}' -o '{ICNS_PATH}'")


def main() -> None:
    ensure_dirs()
    base = generate_base_png(1024)
    base.save(BASE_PNG)
    save_iconset_from_base(base)
    build_icns()
    print(f"Generated: {ICNS_PATH}")


if __name__ == "__main__":
    main()

