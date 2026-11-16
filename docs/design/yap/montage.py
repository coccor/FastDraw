# The top of each accent variant of direction D in a grid, for comparing.   usage: python3 docs/design/yap/montage.py
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

img = Path(__file__).parent / 'img'
names = ['vermilion', 'tomato', 'copper', 'ochre', 'raspberry', 'pink', 'olive', 'green', 'emerald', 'teal', 'petrol', 'cyan']
cols, gap = 4, 24
crops = [Image.open(img / f'd-{n}.png').crop((0, 37, 1440, 1237)) for n in names]
w, h = crops[0].size
rows = (len(crops) + cols - 1) // cols
out = Image.new('RGB', (w * cols + gap * (cols - 1), h * rows + gap * (rows - 1)), '#d9dadf')
for i, c in enumerate(crops):
    out.paste(c, ((i % cols) * (w + gap), (i // cols) * (h + gap)))
d = ImageDraw.Draw(out)
try:
    font = ImageFont.truetype(str(Path(__file__).parents[3] / 'fonts/Geist-SemiBold.ttf'), 64)
except OSError:
    font = ImageFont.load_default()
for i, n in enumerate(names):
    x, y = (i % cols) * (w + gap) + 30, (i // cols) * (h + gap) + h - 110
    d.rounded_rectangle((x - 14, y - 10, x + 380, y + 84), 16, fill='#121318')
    d.text((x + 6, y), n.capitalize(), fill='white', font=font)
out.resize((out.width // 3, out.height // 3)).save(img / 'd-accents.png')
