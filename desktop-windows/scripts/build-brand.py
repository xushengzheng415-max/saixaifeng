"""Adapt the existing, approved bee/football artwork to Windows icon assets."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageChops
import json
import hashlib

root = Path(__file__).resolve().parents[1]
assets = root / 'assets'
assets.mkdir(exist_ok=True)
source = assets / 'brand-original-vertical.png'
original = Image.open(source).convert('RGBA')
vertical_bounds = original.getchannel('A').getbbox()
vertical = original.crop(vertical_bounds)
vertical.thumbnail((800, 1000), Image.Resampling.LANCZOS)
vertical.save(assets / 'brand-vertical.png')
# Preserve the supplied mascot. An empty band separates it from the lettering.
upper = original.crop((0, 0, original.width, 2444))
mark = upper.crop(upper.getchannel('A').getbbox())
square_source = assets / 'brand-original-square.png'
square = Image.open(square_source).convert('RGBA')

def tile(size, background=None):
    side = size * 4
    canvas = square.resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new('L', (side, side), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, side - 1, side - 1), radius=side * .22, fill=255)
    canvas.putalpha(ImageChops.multiply(canvas.getchannel('A'), mask.resize((size, size), Image.Resampling.LANCZOS)))
    return canvas

variants = [('light', '#FFFFFF'), ('dark', '#183B2C'), ('neutral', '#EDF1EE')]
tile(1024).save(assets / 'app-icon-square-1024.png')
tile(512, '#EAF7EE').save(assets / 'icon.png')
tile(256, '#EAF7EE').save(assets / 'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
badge = Image.new('RGBA', (128,128), (0,0,0,0))
badge_draw = ImageDraw.Draw(badge)
badge_draw.ellipse((3,3,125,125), fill='#F6A019')
badge_draw.polygon([(64,25),(28,65),(48,65),(48,100),(80,100),(80,65),(100,65)], fill='white')
badge.resize((32,32), Image.Resampling.LANCZOS).save(assets / 'update-badge.png')
mark.save(assets / 'brand-symbol.png')
for size in (16, 24, 32, 48, 64, 128, 256):
    tile(size, '#EAF7EE').save(assets / f'app-icon-{size}.png')

font_path = 'C:/Windows/Fonts/msyh.ttc'
title = ImageFont.truetype(font_path, 30)
label = ImageFont.truetype(font_path, 20)
small = ImageFont.truetype(font_path, 15)
board = Image.new('RGB', (1380, 670), '#F5F7F6')
draw = ImageDraw.Draw(board)
draw.text((56, 34), '赛小蜂足球 · Windows 应用图标', font=title, fill='#183B2C')
for index, ((name, background), caption) in enumerate(zip(variants, ['浅色桌面', '深色桌面', '圆角外透明'])):
    x = 70 + index * 450
    draw.rounded_rectangle((x, 108, x + 340, 434), 16, fill=background)
    image = tile(242, background)
    board.paste(image, (x + 49, 144), image)
    draw.text((x + 20, 455), caption, font=label, fill='#183B2C')
draw.text((76, 522), '任务栏尺寸', font=label, fill='#183B2C')
x = 250
for size in (16, 24, 32, 48, 64):
    image = tile(size, '#EAF7EE')
    board.paste(image, (x + (80-size)//2, 530 + (64-size)//2), image)
    draw.text((x + 26, 606), str(size), font=small, fill='#627369')
    x += 160
board.save(assets / 'brand-preview.png')
(assets / 'brand-source.json').write_text(json.dumps({
    'name': '赛小蜂足球 Windows 应用图标', 'mode': 'user-supplied-square-rounded',
    'source': 'assets/brand-original-square.png', 'sourceSize': list(square.size),
    'sourceSha256': hashlib.sha256(square_source.read_bytes()).hexdigest(),
    'loginSource': 'assets/brand-original-vertical.png',
    'loginSourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'verticalBounds': list(vertical_bounds), 'symbolBottomExclusive': 2444,
    'cornerRadiusRatio': .22, 'outsideCorners': 'transparent', 'background': 'unchanged honeycomb artwork',
    'note': 'Preserves the approved raster artwork; PNG/ICO assets, no claim of a vector master.'
}, ensure_ascii=False, indent=2), encoding='utf-8')
print('Generated Windows ICO, PNG sizes, transparent source and preview board')
