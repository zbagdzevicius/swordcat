# Mean luminance / saturation / warmth of screenshots (design measurement only).
import sys, colorsys
from PIL import Image
for p in sys.argv[1:]:
    im = Image.open(p).convert('RGB'); im.thumbnail((240, 240)); px = list(im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata())
    L = S = W = 0.0; dark = 0
    for r, g, b in px:
        h, l, s = colorsys.rgb_to_hls(r/255, g/255, b/255)
        y = 0.2126*r/255 + 0.7152*g/255 + 0.0722*b/255
        L += y; S += s * (1 - abs(2*l - 1)); W += (r - b) / 255; dark += y < 0.2
    n = len(px)
    print(f"{p.split('/')[-1]:28s} luma {L/n:.2f}  chroma {S/n:.2f}  warm(r-b) {W/n:+.3f}  dark% {100*dark/n:.0f}")
