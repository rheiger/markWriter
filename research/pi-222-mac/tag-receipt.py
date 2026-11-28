"""Assemble verified component and direct-probe receipts for the tagged release."""
import argparse
import hashlib
import json
import re
from pathlib import Path


def require(condition, message):
    if not condition:
        raise ValueError(message)


def captures(pattern, data):
    found = re.findall(pattern, data, re.M)
    require(len(found) == 1, f'Missing or ambiguous {pattern}')
    return found[0]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('package_manifest', type=Path)
    parser.add_argument('dmghash')
    parser.add_argument('sha')
    parser.add_argument('runid')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    root = args.root
    manifest = json.loads(args.package_manifest.read_bytes())
    require(manifest['source'] == args.sha and str(manifest['buildRun']) == args.runid,
            'Mismatched release commit or workflow run')
    require(manifest['asset']['sha256'] == args.dmghash and manifest['version'] == '2.22.2',
            'Mismatched release DMG')
    multi = root / 'multi'
    single = root / 'single'
    hashes = [line.split(maxsplit=1)[0] for line in (multi / 'hashes.txt').read_text().splitlines()]
    require(len(hashes) == 5 and hashes[0] == args.dmghash, 'DMG probe hash mismatch')
    require([line.split(maxsplit=1)[0] for line in (single / 'hashes.sha256').read_text().splitlines()]
            == [hashes[0],hashes[2],hashes[3]], 'Single and multiblock probes used different artifacts')
    sigs = {}
    for component in ('host','extension'):
        seal = (multi / (component + '-seal.txt')).read_text()
        identity = (multi / (component + '-identity.txt')).read_text()
        require('valid on disk' in seal and 'satisfies its Designated Requirement' in seal,
                f'Missing strict seal for {component}')
        require('Signature=adhoc' in identity.splitlines() and 'TeamIdentifier=not set' in identity.splitlines(),
                f'Unexpected signing identity for {component}')
        sigs[component] = {'strictSealPassed': True, 'signature': 'ad-hoc',
                           'cdhash': captures(r'^CDHash=([a-f0-9]+)$', identity),
                           'identifier': captures(r'^Identifier=(.+)$', identity)}
    require(sigs['host']['identifier'] == 'com.markwriter.app' and
            sigs['extension']['identifier'] == 'com.markwriter.app.quicklook','Wrong bundle identities')
    fixture_before = (multi / 'fixtures-before.txt').read_bytes()
    require(fixture_before == (multi / 'fixtures-after.txt').read_bytes() and fixture_before.count(b': OK') == 8,
            'Fixture integrity mismatch')

    probe = json.loads((single / 'direct-probe.json').read_bytes())
    require(len(probe['cases']) == 11 and all(x['matched'] for x in probe['cases']), 'Single block gate failed')
    require((single / 'requests.txt').read_text().splitlines() == ['/control'], 'Canary received unexpected requests')
    require((single / 'canary-before.sha256').read_bytes() == (single / 'canary-after.sha256').read_bytes(),
            'Canary file changed')

    cases = []
    for name in ('app','closed','open','legacy','negative','oversized','recovery'):
        row = json.loads((multi / (name + '.json')).read_bytes())
        require(row['case'] == name, 'Wrong case name')
        elapsed, rss = captures(r'^rendererElapsedMs=(\d+) probeHighWaterRssBytes=(\d+)$',
                                (multi / (name + '-timing.txt')).read_text())
        cases.append(dict(row, elapsedMs=int(elapsed), probeHighWaterRssBytes=int(rss)))
    receipt = {
        'schemaVersion': 1, 'platform': 'macos-arm64', 'scope': 'Direct WKWebView with the mounted production Finder script. No Finder, editor or VNC interaction.',
        'target': (multi / 'host.txt').read_text().splitlines(), 'version': manifest['version'],
        'source': args.sha, 'buildRun': args.runid, 'tag': 'v2.22.2', 'package': manifest['asset'],
        'qualificationToolRevisions': {
            'multiBlock': 'e88075f3f23c18630c3a1f3ed21ef5b288898fe3',
            'singleBlock': '84ba9135688a0ebed58c05fcf0a789ea7cff50ae',
        },
        'hashes': dict(zip(('dmg','hostExecutable','extensionExecutable','finderJavaScript','exactSwiftRendererSource'),hashes)),
        'strictAdHocSeals': sigs,
        'extensionMachOUuid': captures(r'^UUID: ([0-9A-F-]+) \(arm64\)',(multi / 'extension-uuid.txt').read_text()),
        'fixtureHashesSha256': digest(root / 'fixture-SHA256SUMS'),
        'fixtureSha256': {name: value for value, name in (line.split(maxsplit=1) for line in
                          (root / 'fixture-SHA256SUMS').read_text().splitlines())},
        'multiBlock': cases, 'singleBlock': probe['cases'],
        'canary':{'positiveLoopbackControl':True,'additionalRequests':0,'unchangedLocalFile':True},
    }
    for stem in ('original','original-bytes'):
        require((root / (stem + '-before.txt')).read_bytes() == (root / (stem + '-after.txt')).read_bytes(),
                'Installed provider changed')
    receipt['soleOriginalProviderUuid'] = captures(r'^\s*UUID = (\S+)$',(root / 'original-after.txt').read_text())
    receipt['originalBundleAndRegistrationMatched'] = True
    receipt['caveats'] = 'Renderer elapsed time excludes any Finder display overhead. Probe RSS excludes WebKit child memory.'
    with args.output.open('x') as output:
        json.dump(receipt,output,indent=2)
        output.write('\n')


if __name__ == '__main__':
    main()
