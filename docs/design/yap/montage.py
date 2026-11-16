# The top of each accent variant of direction D, 2x2, for comparing.   usage: python3 docs/design/yap/montage.py
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

img = Path(__file__).parent / 'img'
names = ['vermilion', 'teal', 'green', 'ochre']
crops = [Image.open(img / f'd-{n}.png').crop((0, 37, 1440, 1237)) for n in names]
w, h = crops[0].size
out = Image.new('RGB', (w * 2 + 24, h * 2 + 24), '#d9dadf')
for i, c in enumerate(crops):
    out.paste(c, ((i % 2) * (w + 24), (i // 2) * (h + 24)))
d = ImageDraw.Draw(out)
try:
    font = ImageFont.truetype(str(Path(__file__).parents[3] / 'fonts/Geist-SemiBold.ttf'), 40)
except OSError:
    font = ImageFont.load_default()
for i, n in enumerate(names):
    x, y = (i % 2) * (w + 24) + 30, (i // 2) * (h + 24) + h - 70
    d.rounded_rectangle((x - 12, y - 8, x + 230, y + 50), 12, fill='#121318')
    d.text((x + 4, y), n.capitalize(), fill='white', font=font)
out.resize((out.width // 2, out.height // 2)).save(img / 'd-accents.png')
