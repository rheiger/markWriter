"""Compare two sealed Finder providers on macOS using read-only DMG mounts."""
import argparse
import hashlib
import json
import plistlib
import shutil
import subprocess
import tempfile
from contextlib import ExitStack
from pathlib import Path


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(*args):
    return subprocess.run(args, check=True, capture_output=True)


def inspect_provider(dmg, expected_digest, workspace, name, cleanup):
    if sha256(dmg) != expected_digest:
        raise ValueError(f'{name} DMG does not match the expected SHA-256')
    mount = workspace / name
    mount.mkdir()
    run('hdiutil', 'attach', '-quiet', '-readonly', '-noautoopen', '-nobrowse', '-mountpoint', mount, dmg)
    cleanup.callback(run, 'hdiutil', 'detach', '-quiet', mount)
    provider = mount / 'MarkWriter.app/Contents/PlugIns/MarkWriterQuickLook.appex'
    run('codesign', '--verify', '--strict', provider)
    bundle = {str(p.relative_to(provider)): sha256(p) for p in sorted(provider.rglob('*')) if p.is_file()}
    info = plistlib.loads((provider / 'Contents/Info.plist').read_bytes())
    executable = provider / 'Contents/MacOS' / info['CFBundleExecutable']
    unsigned = workspace / (name + '-unsigned')
    shutil.copyfile(executable, unsigned)
    run('codesign', '--remove-signature', unsigned)
    entitlements = run('codesign', '-d', '--entitlements', '-', '--xml', provider).stdout
    return {
        'dmgSha256': expected_digest,
        'strictSealPassed': True,
        'bundleFiles': bundle,
        'unsignedExecutableSha256': sha256(unsigned),
        'unsignedExecutableBytes': unsigned.stat().st_size,
        'entitlements': plistlib.loads(entitlements) if entitlements else {},
    }, info, unsigned


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('candidate', 'release'):
        parser.add_argument(name, type=Path)
        parser.add_argument(name + '_sha256')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='mw-provider-compare.') as temp, ExitStack() as cleanup:
        work = Path(temp)
        c, c_info, c_unsigned = inspect_provider(args.candidate, args.candidate_sha256, work, 'candidate', cleanup)
        r, r_info, r_unsigned = inspect_provider(args.release, args.release_sha256, work, 'tagged', cleanup)
        paths = sorted(c['bundleFiles'].keys() | r['bundleFiles'].keys())
        result = {
            'scope': 'Finder extension bundle, read-only mounted arm64 DMGs',
            'unsignedComparison': 'codesign --remove-signature on a separate copy of each executable, followed by cmp',
            'candidate': c,
            'tagged': r,
            'differentBundleFiles': [p for p in paths if c['bundleFiles'].get(p) != r['bundleFiles'].get(p)],
            'changedInfoPlistKeys': {k: {'candidate': c_info.get(k), 'tagged': r_info.get(k)}
                                     for k in sorted(c_info.keys() | r_info.keys()) if c_info.get(k) != r_info.get(k)},
            'entitlementsEqual': c['entitlements'] == r['entitlements'],
            'unsignedExecutablesByteIdentical': run_cmp(c_unsigned, r_unsigned),
        }
    print(json.dumps(result, indent=2))


def run_cmp(first, second):
    rc = subprocess.run(['cmp', '-s', first, second]).returncode
    if rc not in (0, 1):
        raise RuntimeError(f'cmp failed with exit code {rc}')
    return rc == 0


if __name__ == '__main__':
    main()
