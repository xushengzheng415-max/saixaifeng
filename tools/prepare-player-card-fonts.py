"""Import supplied fonts and OFL jersey fonts; preserve GBK originals outside runtime."""
from pathlib import Path
import hashlib, json, shutil, urllib.request
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'cloudfunctions/webLoginApi/fonts'
DEST.mkdir(parents=True, exist_ok=True)
LOCAL = Path('Z:/软件备份/电脑字体')
items = [
    ('alimama', '阿里妈妈数黑体', 'Alimama ShuHeiTi', 'AlimamaShuHeiTi-Bold.ttf', '阿里妈妈数黑体.ttf', False),
    ('zongyi', '微软简综艺', 'Sxf Zongyi', 'SxfZongyi.ttf', '微软简综艺.TTF', True),
    ('cuhei', '微软简粗黑', 'Sxf Cuhei', 'SxfCuhei.ttf', '微软简粗黑.TTF', True),
    ('yaku', '汉仪雅库黑', 'HYYakuHei', 'HYYakuHei.ttf', '汉仪雅库黑.ttf', False),
]
new_fonts = []
provenance = []
for key, label, family, filename, source, legacy in items:
    src, dst = LOCAL / source, DEST / filename
    if legacy:
        font = TTFont(src)
        gbk = next(t.cmap for t in font['cmap'].tables if t.platformID == 3 and t.platEncID == 3)
        unicode_map = {}
        for code, glyph in gbk.items():
            try:
                char = code.to_bytes(1 if code < 256 else 2, 'big').decode('gbk')
                if len(char) == 1: unicode_map[ord(char)] = glyph
            except UnicodeError: pass
        for platform, encoding in [(3,1),(0,3)]:
            table = CmapSubtable.newSubtable(4)
            table.platformID, table.platEncID, table.language, table.cmap = platform, encoding, 0, unicode_map.copy()
            font['cmap'].tables.append(table)
        # Legacy fonts mislabel UTF-16 name strings as GBK. Add canonical Unicode
        # family records without changing glyph outlines or embedding flags.
        for name_id, value in [(1,family),(2,'Regular'),(4,family),(6,family.replace(' ','')),(16,family),(17,'Regular')]:
            font['name'].setName(value, name_id, 3, 1, 0x409)
        font.save(dst)
    else: shutil.copyfile(src, dst)
    assert all(ord(c) in TTFont(dst).getBestCmap() for c in '铁栋泽0123456789')
    new_fonts.append(dict(id=key,label=label,family=family,files=[filename],category='chinese'))
    provenance.append(dict(file=filename,source=source,sourceSha256=hashlib.sha256(src.read_bytes()).hexdigest(),adaptation='GBK cmap to Unicode; canonical name records; outlines and fsType preserved' if legacy else 'unaltered'))

for key,label,family,folder,filename in [
    ('graduate','学院球衣 · Graduate','Graduate','graduate','Graduate-Regular.ttf'),
    ('jersey25','方角球衣 · Jersey 25','Jersey 25','jersey25','Jersey25-Regular.ttf'),
    ('blackops','镂空号码 · Black Ops One','Black Ops One','blackopsone','BlackOpsOne-Regular.ttf'),
]:
    base = f'https://raw.githubusercontent.com/google/fonts/main/ofl/{folder}/'
    for remote, name in [(filename,filename),('OFL.txt',family.replace(' ','')+'-OFL.txt')]:
        request = urllib.request.Request(base+remote, headers={'User-Agent':'SxfFontImporter/1.0'})
        with urllib.request.urlopen(request, timeout=60) as response: (DEST/name).write_bytes(response.read())
    new_fonts.append(dict(id=key,label=label,family=family,files=[filename],category='number'))
    provenance.append(dict(file=filename,source=base+filename,license='SIL OFL 1.1',licenseFile=family.replace(' ','')+'-OFL.txt'))

contract_path = ROOT/'cloudfunctions/webLoginApi/player-card-text-styles.json'
contract = json.loads(contract_path.read_text(encoding='utf-8'))
contract['fonts'] = [f for f in contract['fonts'] if f['id'] in ['sans','brush','sport']]
for font in contract['fonts']: font['category'] = 'number' if font['id']=='sport' else 'chinese'
contract['fonts'].extend(new_fonts)
contract_path.write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
manifest_path = ROOT/'cloudfunctions/webLoginApi/player-card-font-manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
manifest = [r for r in manifest if r['name'] not in {f['files'][0] for f in new_fonts}]
for font in new_fonts:
    filename = font['files'][0]
    manifest.append(dict(name=filename,sha256=hashlib.sha256((DEST/filename).read_bytes()).hexdigest(),url=f'https://pingtai.sxffootball.cn/fonts/player-card/{filename}'))
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for target in [ROOT/'platform-admin-vue/public/fonts/player-card',ROOT/'cloudfunctions/getMiniWorkspace/fonts',ROOT/'cloudfunctions/playerCardPublishWorker/fonts']:
    target.mkdir(parents=True,exist_ok=True)
    for row in provenance:
        shutil.copyfile(DEST/row['file'],target/row['file'])
        if row.get('licenseFile'): shutil.copyfile(DEST/row['licenseFile'],target/row['licenseFile'])
(DEST/'ADDED-FONTS.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
shutil.copyfile(DEST/'ADDED-FONTS.json',ROOT/'platform-admin-vue/public/fonts/player-card/ADDED-FONTS.json')
print('Imported 4 supplied Chinese fonts (2 GBK compatibility conversions) and 3 OFL number fonts.')
