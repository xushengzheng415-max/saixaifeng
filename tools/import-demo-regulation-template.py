"""Import the user-provided Word example without altering its original file."""
import hashlib
import json
import shutil
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

source = Path(sys.argv[1])
root = Path(__file__).resolve().parents[1]
ns = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
document = ET.fromstring(zipfile.ZipFile(source).read('word/document.xml'))
text = '\n'.join(''.join(node.itertext()) for node in document.findall('.//w:p',ns))
assert '2026年「青春杯」青少年足球邀请赛' in text
assert '全场比赛时间为50分钟' in text and '运动员12人' in text
manifest = {
  'schemaVersion':1, 'sourceFileName':source.name,
  'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(), 'sourceText':text,
  'data':{
    'basicInfo':{'name':'2026年「青春杯」青少年足球邀请赛','category':'youth','startDate':'2026-07-01','endDate':'2026-07-10','deadline':'2026-06-25','location':'市青少年足球训练基地'},
    'organizationStructure':{'organizers':['市体育局','市教育局'],'undertakers':['市足球协会','市青少年体育俱乐部'],'coOrganizers':[]},
    'divisions':[{
      'name':'青少年组','ageGroup':'open','matchFormat':'8side','expectedTeams':8,
      'formatType':'hybrid','groupCount':2,'teamsPerGroup':4,'groupCycle':'single','advancePerGroup':2,'knockoutSize':4,
      'periodMode':'halves','matchMinutes':50,'breakMinutes':10,'rosterLimit':12,
      'substitutionMode':'free','substitutionLimit':0,'substitutionWindows':0,'substitutionReentryAllowed':True,
      'yellowCardSuspension':2,'redCardSuspension':1,'winPoints':3,'drawPoints':1,'lossPoints':0,
      'knockoutTieBreak':'penalties','knockoutYellowReset':True,'secondYellowRed':True,'thirdPlaceEnabled':True,
      'identityDocumentRequired':True,'insuranceRequired':True,
      'eligibilityNotes':'范本未指定具体年龄区间；报名须提交身份证明、健康证明和保险凭证。',
      'regulationDetails':{'teamLeaderLimit':1,'coachLimit':1,'matchBallSize':4,'minimumPlayersToContinue':5,'twoKitsRequired':True,'shinGuardsRequired':True,'metalStudsForbidden':True,'substitutionReentryForbidden':False,'cardsCarryToNextStage':False}
    }],
    'sharedRegulationDetails':{'teamLeaderLimit':1,'coachLimit':1,'matchBallSize':4,'minimumPlayersToContinue':5,'twoKitsRequired':True,'shinGuardsRequired':True,'metalStudsForbidden':True},
    'sourceNotes':['地点仅给出训练基地，没有省市信息。','范本未提供具体年龄区间、联系人和电话。','小组赛黄牌在淘汰赛阶段清零；淘汰赛平局直接点球，无加时。']
  }
}
target = root/'web-admin-vue/src/data/demoRegulationTemplate.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
public = root/'web-admin-vue/public/assets/demo-regulations/youth-football-regulations.docx'
public.parent.mkdir(parents=True,exist_ok=True)
shutil.copyfile(source,public)
print('Imported original Word example and source-based local recognition manifest')
