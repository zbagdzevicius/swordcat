# Dev helper: crop the same box out of several screenshots and tile them with labels.
# Usage: python grid.py out.png x0,y0,x1,y1 cols a.png b.png ...
import sys, os
from PIL import Image, ImageDraw
out, box, cols, files = sys.argv[1], tuple(int(v) for v in sys.argv[2].split(',')), int(sys.argv[3]), sys.argv[4:]
tiles = [Image.open(f).convert('RGB').crop(box) for f in files]
w, h = tiles[0].size
rows = (len(tiles) + cols - 1) // cols
im = Image.new('RGB', (w * cols, h * rows), (20, 20, 20))
for i, (t, f) in enumerate(zip(tiles, files)):
    x, y = (i % cols) * w, (i // cols) * h
    im.paste(t, (x, y))
    ImageDraw.Draw(im).text((x + 6, y + 4), os.path.basename(f), fill=(255, 255, 0))
im.save(out)
