import json, os, select, signal, subprocess, time
cmd = ['/usr/bin/python3', 'research/deadline-child.py']
process = subprocess.Popen(cmd + ['stuck'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, start_new_session=True)
try:
    ready, _, _ = select.select([process.stdout], [], [], 15)
    assert ready and process.stdout.readline().strip() == 'READY', 'child did not start'
    start = time.monotonic()
    time.sleep(1)
    assert process.poll() is None, 'synthetic stuck child exited early'
    os.killpg(process.pid, signal.SIGKILL)
    process.wait(timeout=5)
    duration = round(time.monotonic() - start, 3)
    recovered = subprocess.run(cmd + ['recovery'], capture_output=True, text=True, timeout=20, check=True)
    assert recovered.stdout.strip() == 'OK:true', recovered.stdout
    print(json.dumps({'syntheticInterrupt':'SIGKILL process group', 'delaySeconds':duration,'killedExit':process.returncode,'freshProcessRecovery':recovered.stdout.strip(), 'qualification':'direct WebKitGTK, not a packaged app or Finder'}))
finally:
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()
