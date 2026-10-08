"""Mirror only the explicitly marked fixture library into a browser demo module."""
import json,sys,re,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DATASET='football-ai-fixtures-20260822-16teams-v1'
def read_cli(path):
    source=Path(path).read_text(encoding='utf-8-sig');decoder=json.JSONDecoder();values=[];offset=0
    while offset<len(source):
        index=source.find('{',offset)
        if index<0:break
        try:value,length=decoder.raw_decode(source[index:]);values.append(value);offset=index+length
        except ValueError:offset=index+1
    return values[-1]['data']['results'][0]
def scalar(value):
    if isinstance(value,dict):return value.get('$numberInt',value.get('$numberDouble',value.get('$date','')))
    return value
def asset(value,fallback=''):
    value=str(value or '')
    match=re.search(r'(team-crests/team-\d{2}\.svg|players/(?:u8|u10|u12)/player-\d{2}\.jpg)',value)
    relative=match.group(0) if match else fallback
    if not relative:return ''
    original=ROOT/'assets/synthetic-fixtures'/relative
    if not original.is_file():raise ValueError('Missing existing fixture asset '+relative)
    destination=ROOT/'web-admin-vue/public/assets/synthetic-fixtures'/relative
    destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(original,destination)
    return 'assets/synthetic-fixtures/'+relative
teams=read_cli(sys.argv[1]);players=read_cli(sys.argv[2]);catalog=[]
for team in teams:
    if team.get('synthetic') is not True or team.get('syntheticDatasetId')!=DATASET:continue
    roster=[]
    for player in players:
        if player.get('teamId')!=team['_id'] or player.get('synthetic') is not True or player.get('syntheticDatasetId')!=DATASET:continue
        photo=player.get('photoUrl') or player.get('avatarUrl') or player.get('photoFileID')
        number=int(scalar(player.get('jerseyNumber') or player.get('number') or 0) or 0)
        roster.append({'key':f"{team['syntheticKey']}:player:{number}",'name':player.get('name') or player.get('realName') or '', 'birthDate':str(scalar(player.get('birthDate','')))[:10],'gender':player.get('gender',''),'number':number,'position':player.get('position',''),'avatarPath':asset(photo)})
    if len(roster)!=15:raise ValueError(f"Incomplete fixture roster: {team['name']} / {len(roster)}")
    if len({person['number'] for person in roster})!=len(roster):raise ValueError('Fixture jersey numbers must be unique')
    catalog.append({'key':team['syntheticKey'],'name':team.get('name') or team.get('teamName'),'ageGroup':team['ageGroup'],'logoPath':asset(team.get('logo') or team.get('logoUrl')),'players':roster})
assert len(catalog)==48
for crest in (ROOT/'assets/synthetic-fixtures/team-crests').glob('team-*.svg'):
    asset('team-crests/'+crest.name)
target=ROOT/'web-admin-vue/src/data/syntheticTeamCatalog.mjs'
target.write_text('// Read-only mirror of explicitly synthetic source records; production IDs and private fields omitted.\nexport default '+json.dumps({'datasetId':DATASET,'teams':catalog},ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
print(f'Mirrored {len(catalog)} existing virtual teams and {sum(len(team["players"]) for team in catalog)} virtual players')
