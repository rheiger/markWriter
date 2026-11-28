import concurrent.futures
import hashlib
import json
import pathlib
import re
import subprocess
import sys

stage, destination, visibility, expected_commit = sys.argv[1:]
stage = pathlib.Path(stage)
destination = pathlib.Path(destination)
destination.mkdir()
def gh(*args):
    return subprocess.check_output(['gh', *args])
def sha(path):
    return hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()
release = json.loads(gh('release','view','v2.22.2','-R','rheiger/markWriter','--json','tagName,isDraft,isPrerelease,assets,url'))
assert release['isDraft'] == (visibility == 'draft') and not release['isPrerelease'] and release['tagName'] == 'v2.22.2'
assets = {a['name']: a for a in release['assets']}
assert len(assets) == len(release['assets']) and set(assets) == {p.name for p in stage.iterdir() if p.is_file()}
def load_one(asset):
    name, obj = asset
    assert re.fullmatch(r'[\w.-]+',name)
    target = destination / name
    if visibility == 'public':
        subprocess.run(['curl','--fail','--silent','--show-error','--location','--retry','3','--output',str(target),
            'https://github.com/rheiger/markWriter/releases/download/v2.22.2/'+name],check=True)
    else:
        subprocess.run(['gh','release','download','v2.22.2','-R','rheiger/markWriter','-D',str(destination),'--pattern',name],check=True)
    assert target.stat().st_size == obj['size'] and sha(target) == sha(stage/name),name
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
    list(ex.map(load_one,assets.items()))
checks = subprocess.check_output(['sha256sum','--strict','-c','SHA256SUMS'],cwd=destination,text=True)
ledger = (destination/'SHA256SUMS').read_text().splitlines()
names = [s.split('  ',1)[1] for s in ledger]
assert len(names)==len(set(names)) and set(names)==set(assets)-{'SHA256SUMS'}
manifest = json.loads((destination/'release-manifest.json').read_text())
assert manifest['source']==expected_commit and manifest['version']=='2.22.2'
print(checks)
print(json.dumps({'visibility':visibility,'commit':expected_commit,'matchedAssets':len(assets),'sha256sumsDigest':sha(destination/'SHA256SUMS')}, sort_keys=True))
