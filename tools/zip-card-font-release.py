from pathlib import Path
import json, zipfile, hashlib
root=Path('work/card-font-release-20261028')
report=json.loads((root/'delta.json').read_text())
for name, details in report.items():
    changed=set(details['changed'])
    target=root/(name+'-fonts.zip')
    with zipfile.ZipFile(root/'before'/(name+'.zip')) as src, zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as dst:
        originals={i.filename:i for i in src.infolist()}
        for key,info in originals.items():
            if key not in changed: dst.writestr(info,src.read(key))
        for key in sorted(changed): dst.write(root/'after'/name/key,key)
    with zipfile.ZipFile(root/'before'/(name+'.zip')) as src,zipfile.ZipFile(target) as new:
        unexpected=[key for key in src.namelist() if key not in changed and src.read(key)!=new.read(key)]
        assert not unexpected,unexpected
        details['preservedZipEntries']=len([k for k in src.namelist() if k not in changed])
        details['zipSha256']=hashlib.sha256(target.read_bytes()).hexdigest()
        details['zipBytes']=target.stat().st_size
    print(name,details['zipBytes'],'bytes; preserved',details['preservedZipEntries'],'original entries including dependencies')
(root/'delta.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
