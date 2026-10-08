# Dev helper: side-by-side compare a screenshot with a reference image. Usage: python cmp.py shot.png ref.jpg out.png
import sys
from PIL import Image
a = Image.open(sys.argv[1]).convert('RGB'); r = Image.open(sys.argv[2]).convert('RGB')
h = a.height; r = r.resize((int(r.width * h / r.height), h))
im = Image.new('RGB', (r.width + a.width + 20, h)); im.paste(r, (0, 0)); im.paste(a, (r.width + 20, 0)); im.save(sys.argv[3])
