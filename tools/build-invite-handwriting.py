from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen,RecordingPen
from fontTools.pens.basePen import BasePen
class OutlinePen(BasePen):
 def __init__(self,gs):super().__init__(gs);self.value=[]
 def _moveTo(self,p):self.value.append(('moveTo',[p]))
 def _lineTo(self,p):self.value.append(('lineTo',[p]))
 def _curveToOne(self,p1,p2,p3):self.value.append(('curveTo',[p1,p2,p3]))
 def _closePath(self):self.value.append(('closePath',[]))
 def _endPath(self):self.value.append(('endPath',[]))
import json,re,ast,hashlib,shutil
root=Path.cwd();font=TTFont(root/'assets/team-invite-v2/MaShanZheng-Regular.ttf');gs=font.getGlyphSet();cmap=font.getBestCmap();out=root/'assets/team-invite-handwriting-v1';out.mkdir(exist_ok=True)
page=(root/'miniprogram/pages/team/player-invite/player-invite.js').read_text(encoding='utf-8');match=re.search(r'var quotes=(\[.*?\])',page);quotes=ast.literal_eval(match.group(1)) if match else json.loads((root/'miniprogram/pages/team/player-invite/invite-handwriting-core.js').read_text(encoding='utf-8').split('=',1)[1])['quotes'];corechars=set(''.join(quotes)+'— '+''.join(chr(i) for i in range(32,127)))
chunks={};core={};ops={'moveTo':0,'lineTo':1,'curveTo':2,'closePath':3,'endPath':3}
for char,name in cmap.items():
 glyph=gs[name];b=OutlinePen(gs);glyph.draw(b);commands=[]
 for op,points in b.value:
  assert op in ops,op
  commands.append([ops[op]]+[round(v) for point in points for v in point])
 entry=[glyph.width,commands];key=str(char);bucket=format(char>>8,'x');chunks.setdefault(bucket,{})[key]=entry
 if chr(char) in corechars:core[key]=entry
meta={'units':font['head'].unitsPerEm,'glyphs':core,'quotes':quotes,'license':(root/'assets/team-invite-v2/OFL.txt').read_text(encoding='utf-8')}
(root/'miniprogram/pages/team/player-invite/invite-handwriting-core.js').write_text('module.exports='+json.dumps(meta,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
for bucket,glyphs in chunks.items():(out/('glyphs-'+bucket+'.json')).write_text(json.dumps({'units':meta['units'],'glyphs':glyphs},separators=(',',':')),encoding='utf-8')
shutil.copy2(root/'assets/team-invite-v2/OFL.txt',out/'OFL.txt');manifest={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()};(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
print({'glyphs':len(cmap),'chunks':len(chunks),'coreBytes':(root/'miniprogram/pages/team/player-invite/invite-handwriting-core.js').stat().st_size,'remoteBytes':sum(p.stat().st_size for p in out.iterdir())})
