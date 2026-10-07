"""Create original transparent tournament marks for the browser demo."""
from pathlib import Path
from math import cos, sin, pi
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / 'web-admin-vue/public/assets/demo-tournament-logos'
OUT.mkdir(parents=True, exist_ok=True)
SCALE = 3

def polygon(cx, cy, radius, count, rotation=-pi/2):
    return [(cx+radius*cos(rotation+2*pi*n/count), cy+radius*sin(rotation+2*pi*n/count)) for n in range(count)]

def make(name, primary, accent, kind):
    image = Image.new('RGBA', (1500, 1500), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    def points(values): return [(round(x*SCALE), round(y*SCALE)) for x,y in values]
    def line(values, fill, width): draw.line(points(values), fill=fill, width=width*SCALE, joint='curve')
    def shape(values, fill): draw.polygon(points(values), fill=fill)
    def ellipse(box, fill, outline=None, width=1): draw.ellipse(tuple(round(v*SCALE) for v in box), fill=fill, outline=outline, width=width*SCALE)
    shield = [(250,42),(407,103),(389,305),(344,374),(250,454),(156,374),(111,305),(93,103)]
    shape(shield, primary)
    line(shield+[shield[0]], primary, 9)
    inner=[(250,68),(383,119),(367,296),(326,355),(250,423),(174,355),(133,296),(117,119)]
    line(inner+[inner[0]], '#FFFFFF', 5)
    if kind == 'field':
        line([(154,180),(346,180),(346,316),(154,316),(154,180)], accent, 7)
        line([(250,180),(250,316)], accent, 5)
        ellipse((222,220,278,276), None, accent, 5)
    elif kind == 'city':
        for left, top, right in [(150,157,190),(203,130,246),(258,148,293),(305,175,345)]:
            shape([(left,top),(right,top),(right,280),(left,280)], accent)
    else:
        shape(polygon(250,144,65,5), accent)
        shape(polygon(250,144,32,5,pi/2), primary)
        line([(152,307),(195,343),(250,362),(305,343),(348,307)], accent, 10)
    ellipse((183,199,317,333), '#FFFFFF', primary, 5)
    shape(polygon(250,259,24,5), primary)
    for x,y in polygon(250,259,24,5):
        angle=__import__('math').atan2(y-259,x-250)
        ex,ey=250+65*cos(angle),259+65*sin(angle)
        line([(x,y),(ex,ey)], primary, 3)
        shape(polygon(ex,ey,13,5), primary)
    line([(192,373),(250,397),(308,373)], '#FFFFFF', 5)
    image = image.resize((500,500), Image.Resampling.LANCZOS)
    image.save(OUT / (name+'.png'), optimize=True)
    assert image.getpixel((0,0))[3] == 0

make('field-cup', '#087C47', '#70DCA2', 'field')
make('city-league', '#164E71', '#73CADD', 'city')
make('rising-cup', '#8D3C21', '#FFC866', 'rising')
print('Created 3 original 500x500 transparent PNG marks')
