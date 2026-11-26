"""Drive the synthetic GTK Save File dialog on an isolated Xvfb display."""
import ctypes
import os
import re
import subprocess
import time

x11 = ctypes.CDLL('libX11.so.6')
xtst = ctypes.CDLL('libXtst.so.6')
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
x11.XStringToKeysym.restype = ctypes.c_ulong
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XKeysymToKeycode.restype = ctypes.c_uint
x11.XFlush.argtypes = [ctypes.c_void_p]
x11.XSetInputFocus.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
xtst.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
xtst.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
d = x11.XOpenDisplay(None)
if not d:
    raise RuntimeError('No X display')
def key(name, down):
    code = x11.XKeysymToKeycode(d, x11.XStringToKeysym(name.encode()))
    if not code:
        raise ValueError(name)
    xtst.XTestFakeKeyEvent(d, code, down, 0)
    x11.XFlush(d)
    time.sleep(.01)
def tap(name):
    key(name, 1)
    key(name, 0)
time.sleep(2)
info = subprocess.check_output(['xwininfo', '-name', 'Save File'], text=True)
window = int(re.search(r'Window id: (0x[0-9a-f]+)', info).group(1), 16)
left = int(re.search(r'Absolute upper-left X:\s*(-?\d+)', info).group(1))
top = int(re.search(r'Absolute upper-left Y:\s*(-?\d+)', info).group(1))
width = int(re.search(r'Width:\s*(\d+)', info).group(1))
height = int(re.search(r'Height:\s*(\d+)', info).group(1))
x11.XSetInputFocus(d, window, 1, 0)
xtst.XTestFakeMotionEvent(d, -1, left + min(250, width - 10), top + 25, 0)
xtst.XTestFakeButtonEvent(d, 1, 1, 0)
xtst.XTestFakeButtonEvent(d, 1, 0, 0)
x11.XFlush(d)
time.sleep(.3)
for char in os.environ['MW_EXPORT_PATH']:
    tap({'/':'slash', '.':'period', '-':'minus'}.get(char, char))
time.sleep(.3)
xtst.XTestFakeMotionEvent(d, -1, left + width - 36, top + height - 23, 0)
xtst.XTestFakeButtonEvent(d, 1, 1, 0)
xtst.XTestFakeButtonEvent(d, 1, 0, 0)
x11.XFlush(d)
