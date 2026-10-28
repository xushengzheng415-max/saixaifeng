from pathlib import Path
import json,zipfile,hashlib
root=Path('work/card-font-release-20261028')
delta=json.loads((root/'delta.json').read_text())
report={}
for name,info in delta.items():
    with zipfile.ZipFile(root/'before'/(name+'.zip')) as old,zipfile.ZipFile(root/(name+'-readback.zip')) as live:
        changed=set(info['changed']); expected=set(old.namelist())|changed
        missing=[k for k in expected if k not in live.namelist()]
        wrong=[k for k in changed if k in live.namelist() and hashlib.sha256(live.read(k)).hexdigest()!=info['hashes'][k]]
        metadata=[k for k in old.namelist() if k=='node_modules/.package-lock.json' and k in live.namelist() and old.read(k)!=live.read(k)]
        unrelated=[k for k in old.namelist() if k not in changed and k not in metadata and k in live.namelist() and old.read(k)!=live.read(k)]
        extras=[k for k in live.namelist() if k not in expected]
        report[name]=dict(missing=missing,wrongDelta=wrong,unrelatedChanges=unrelated,metadataOnlyChanges=metadata,extras=extras,verifiedDelta=len(changed),preservedFiles=len(old.namelist())-len(changed&set(old.namelist())))
        print(name, json.dumps(report[name],ensure_ascii=False))
(root/'readback-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
assert all(not (r['missing'] or r['wrongDelta'] or r['unrelatedChanges']) for r in report.values()),'Readback mismatch; inspect report before claiming complete'
