"""Check the real app's notice response in an isolated WebKitGTK session."""
import hashlib
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def request(driver_port, path, payload=None):
    url = f"http://127.0.0.1:{driver_port}{path}"
    body = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.load(response)["value"]


def main(package_dir, expected_commit):
    manifest = json.loads((package_dir / "ubuntu-26.04-x64.manifest.json").read_text())
    assert manifest["source"] == expected_commit
    package = package_dir / manifest["asset"]["name"]
    assert digest(package) == manifest["asset"]["sha256"]
    notice = package_dir / "THIRD_PARTY_NOTICES.txt"
    driver_port, native_port = port(), port()
    while driver_port == native_port:
        native_port = port()

    with tempfile.TemporaryDirectory(prefix="mw-live-notice-") as tmp:
        base = Path(tmp)
        subprocess.run(["dpkg-deb", "-x", package, base / "unpacked"], check=True)
        binary = base / "unpacked/usr/bin/markwriter"
        assert digest(binary) == manifest["binaryInspection"]["sha256"]
        (base / "profile").mkdir()
        env = {**os.environ, "MARKWRITER_PROFILE_DIR": str(base / "profile"), "GDK_BACKEND": "x11"}
        driver = subprocess.Popen(["tauri-driver", "--port", str(driver_port), "--native-port", str(native_port)],
                                  env=env, start_new_session=True, stdout=subprocess.DEVNULL)
        session = None
        try:
            for _ in range(120):
                if driver.poll() is not None:
                    raise RuntimeError("Owned driver exited")
                try:
                    if request(driver_port, "/status")["ready"]:
                        break
                except OSError:
                    pass
                time.sleep(0.1)
            else:
                raise RuntimeError("Driver failed to become ready")
            capabilities = {"alwaysMatch": {"tauri:options": {"application": str(binary)}}}
            session = request(driver_port, "/session", {"capabilities": capabilities})["sessionId"]
            script = """
              const done = arguments[arguments.length - 1];
              (async () => {
                const r = await fetch('/THIRD_PARTY_NOTICES.txt', {cache:'no-store'});
                const bytes = await r.arrayBuffer();
                const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
                done({url:r.url,status:r.status,contentType:r.headers.get('content-type'),
                      bytes:bytes.byteLength,sha256:Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('')});
              })().catch(error => done({error:String(error)}));
            """
            result = request(driver_port, f"/session/{session}/execute/async", {"script": script, "args": []})
            assert result["status"] == 200 and result["sha256"] == digest(notice), result
            assert result["bytes"] == notice.stat().st_size, result
            print(json.dumps({"source": expected_commit, "packageSha256": digest(package),
                              "hostSha256": digest(binary), "response": result,
                              "scope":"Extracted Ubuntu DEB on Debian under isolated Xvfb; same-origin resource fetch."}, indent=2))
        finally:
            if session:
                req = urllib.request.Request(f"http://127.0.0.1:{driver_port}/session/{session}", method="DELETE")
                try:
                    urllib.request.urlopen(req, timeout=5).close()
                except OSError:
                    pass
            try:
                os.killpg(driver.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            driver.wait(timeout=8)


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve(), sys.argv[2])
