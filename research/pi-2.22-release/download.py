"""Download and attest one installer from an explicitly selected release build."""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import zipfile
from pathlib import Path


REPOSITORY = "rheiger/markWriter"
WORKFLOW = ".github/workflows/tauri-prerelease.yml"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def github(path):
    data = subprocess.check_output(["gh", "api", f"repos/{REPOSITORY}/{path}"])
    return json.loads(data)


def validate_request(request):
    require(set(request) == {"version", "source", "buildRun"}, "Expected version, source and buildRun")
    require(re.fullmatch(r"2\.22\.[1-9][0-9]*", request["version"]), "Expected a 2.22 release patch")
    require(re.fullmatch(r"[0-9a-f]{40}", request["source"]), "Expected a full commit SHA")
    require(re.fullmatch(r"[1-9][0-9]*", request["buildRun"]), "Expected a positive build run ID string")


def verified_download(target, receipts):
    request = json.loads(Path("research/pi-2.22-release/request.json").read_bytes())
    validate_request(request)
    version, source, run_id = (request[key] for key in ("version", "source", "buildRun"))
    tag = f"v{version}"
    require(os.environ["GITHUB_REPOSITORY"] == REPOSITORY, "Unexpected repository")
    # The commit API dereferences annotated as well as lightweight tags.
    require(github(f"commits/refs/tags/{tag}")["sha"] == source, "Tag does not resolve to the expected SHA")
    run = github(f"actions/runs/{run_id}")
    require(run["id"] == int(run_id) and run["head_sha"] == source and run["path"] == WORKFLOW
            and run["head_repository"]["full_name"] == REPOSITORY and run["status"] == "completed"
            and run["conclusion"] == "success", "Producer workflow, result or commit mismatch")
    artifacts = github(f"actions/runs/{run_id}/artifacts?per_page=100")["artifacts"]
    matches = [a for a in artifacts if a["name"] == f"package-{target}" and not a["expired"]]
    require(len(matches) == 1, "Expected one available producer artifact")
    artifact = matches[0]
    require(re.fullmatch(r"sha256:[0-9a-f]{64}", artifact["digest"]), "Missing artifact digest")
    receipts.mkdir(exist_ok=True)
    with Path("candidate.zip").open("xb") as output:
        subprocess.run(["gh", "api", f"repos/{REPOSITORY}/actions/artifacts/{artifact['id']}/zip"],
                       stdout=output, check=True)
    archive_path = Path("candidate.zip")
    require(archive_path.stat().st_size == artifact["size_in_bytes"], "Artifact byte count mismatch")
    with archive_path.open("rb") as archive_file:
        require(f"sha256:{hashlib.file_digest(archive_file, 'sha256').hexdigest()}" == artifact["digest"],
                "Downloaded artifact digest mismatch")
    extension = {"windows-x64": "exe", "ubuntu-26.04-x64": "deb"}[target]
    installer_name = f"MarkWriter-{version}-{target}.{extension}"
    manifest_name = f"{target}.manifest.json"
    destination = Path("candidate")
    destination.mkdir()
    with zipfile.ZipFile(archive_path) as archive:
        for name in (manifest_name, installer_name):
            require(archive.namelist().count(name) == 1, f"Expected exactly one {name}")
        manifest = json.loads(archive.read(manifest_name))
        asset = manifest["asset"]
        require(manifest["product"] == "MarkWriter" and manifest["version"] == version and
                manifest["source"] == source and manifest["buildRun"] == run_id and manifest["platform"] == target
                and manifest["architecture"] == "x64" and manifest["signing"]["status"] == "unsigned"
                and asset["name"] == installer_name, "Unexpected source, version, package or signing status")
        require(archive.getinfo(installer_name).file_size == asset["size"], "Installer byte count mismatch")
        for name in (manifest_name, installer_name):
            with archive.open(name) as incoming, (destination / name).open("xb") as output:
                shutil.copyfileobj(incoming, output)
    with (destination / installer_name).open("rb") as binary:
        require(hashlib.file_digest(binary, "sha256").hexdigest() == asset["sha256"], "Installer hash mismatch")
    receipt = {"request": request, "tag": tag, "producerWorkflow": run["path"], "runAttempt": run["run_attempt"],
               "archive": {key: artifact[key] for key in ("id", "name", "size_in_bytes", "digest")},
               "asset": asset, "binary": manifest["binaryInspection"], "harnessCommit": os.environ["GITHUB_SHA"],
               "qualificationRun": os.environ["GITHUB_RUN_ID"]}
    (receipts / "release-package-identity.json").write_text(json.dumps(receipt, indent=2) + "\n")
    archive_path.unlink()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("target", choices=("windows-x64", "ubuntu-26.04-x64"))
    parser.add_argument("receipts", type=Path)
    args = parser.parse_args()
    verified_download(args.target, args.receipts)
