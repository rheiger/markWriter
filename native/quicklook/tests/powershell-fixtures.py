#!/usr/bin/env python3
"""Create synthetic PowerShell sources for Finder preview qualification."""

import argparse
import hashlib
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory for the fixtures")
    parser.add_argument("--inspect", action="store_true", help="report existing fixtures without writing")
    args = parser.parse_args()

    body = "".join(
        f'$line{index} = "Grüße & 日本語" # A descriptive comment for this example disambiguates the line from the next one.\n'
        for index in range(1000)
    )
    fixtures = {
        "highlighted.ps1": body + 'Write-Output "final_sentinel"\n',
        "long-line.ps1": body + "# " + "x" * (16 * 1024) + '\nWrite-Output "literal_sentinel"\n',
        "over-file-limit.ps1": ("# " + "x" * 1021 + "\n") * 1024 + 'Write-Output "over_limit_sentinel"\n',
    }

    if not args.inspect:
        args.directory.mkdir()
        for name, source in fixtures.items():
            (args.directory / name).write_bytes(source.encode("utf-8"))

    receipt = {}
    for name in fixtures:
        path = args.directory / name
        data = path.read_bytes()
        receipt[name] = {
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "mtimeNs": path.stat().st_mtime_ns,
        }
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
