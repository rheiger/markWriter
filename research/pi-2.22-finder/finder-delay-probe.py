import json, os, pathlib, signal, subprocess, sys, time
expected = pathlib.Path(sys.argv[1]).resolve()
with pathlib.Path(sys.argv[2]).open() as log:
    end=time.monotonic()+18
    while time.monotonic()<end:
        line=log.readline()
        if not line:
            time.sleep(0.006)
            continue
        try: event=json.loads(line)
        except ValueError: continue
        msg=event.get('eventMessage','')
        if event.get('processImagePath')!=str(expected) or not msg.startswith('request=') or not msg.endswith(' start'):
            continue
        pid=int(event['processID'])
        command=subprocess.check_output(['/bin/ps','-p',str(pid),'-o','comm='],text=True).strip()
        if pathlib.Path(command).resolve()!=expected:
            raise SystemExit(f'Unexpected executable for test process {pid}')
        started=subprocess.check_output(['/bin/ps','-p',str(pid),'-o','lstart='],text=True).strip()
        watchdog = r'''
            sleep 13
            actual=$(/bin/ps -p "$1" -o comm= 2>/dev/null | /usr/bin/xargs)
            started=$(/bin/ps -p "$1" -o lstart= 2>/dev/null | /usr/bin/xargs)
            if [ "$actual" = "$2" ] && [ "$started" = "$3" ]; then /bin/kill -CONT "$1"; fi
        '''
        safety=subprocess.Popen(['/bin/sh','-c',watchdog,'watchdog',str(pid),command,' '.join(started.split())],start_new_session=True)
        try:
            start=time.monotonic()
            os.kill(pid,signal.SIGSTOP)
            print(f'test_pid={pid} {msg}',flush=True)
            time.sleep(8.25)
        finally:
            try:
                current=subprocess.check_output(['/bin/ps','-p',str(pid),'-o','comm='],text=True).strip()
                current_started=subprocess.check_output(['/bin/ps','-p',str(pid),'-o','lstart='],text=True).strip()
                if pathlib.Path(current).resolve()==expected and current_started==started:
                    os.kill(pid,signal.SIGCONT)
            except (ProcessLookupError, subprocess.CalledProcessError):
                pass
            safety.terminate()
            print(f'forced_suspend_seconds={time.monotonic()-start:.3f}',flush=True)
        break
    else:
        raise SystemExit('No start event from exact test extension')
