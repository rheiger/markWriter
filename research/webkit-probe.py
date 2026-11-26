import gi, json, pathlib, time, threading, urllib.request, tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer

gi.require_version('Gtk', '3.0')
gi.require_version('WebKit2', '4.1')
from gi.repository import Gtk, WebKit2, GLib

requests = []
class Canary(BaseHTTPRequestHandler):
    def do_GET(self):
        requests.append(self.path)
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(b'PI222_HTTP_CANARY')
    def log_message(self, *_):
        pass
server = HTTPServer(('127.0.0.1', 0), Canary)
threading.Thread(target=server.serve_forever, daemon=True).start()
url = 'http://127.0.0.1:' + str(server.server_port)
positive = urllib.request.urlopen(url+'/positive-control', timeout=2).read().decode()
temporary = tempfile.TemporaryDirectory(prefix='markwriter-pi222-canary-')
canary = pathlib.Path(temporary.name) / 'canary.puml'
canary.write_text('PI222_FILE_CANARY')
policy = "default-src 'none'; connect-src 'none'; script-src 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"
manager = WebKit2.UserContentManager()
manager.register_script_message_handler('result')
window = Gtk.Window()
view = WebKit2.WebView.new_with_user_content_manager(manager)
window.add(view)
window.show_all()
engine = pathlib.Path('package/plantuml.js').read_text().replace('export{C as render,D as renderToString};','globalThis.mwRender = D;')
assert 'globalThis.mwRender = D;' in engine
script = pathlib.Path('research/webkit-probe.js').read_text().replace('__CANARY_URL__', url).replace('__CANARY_FILE__', str(canary))
start = time.monotonic()
phase = 'control'
browser_positive = None
protected_html = '<!doctype html><meta http-equiv="Content-Security-Policy" content="'+policy+'"><body><pre id="source"></pre></body>'
def result(_manager, message):
    global phase, browser_positive
    data = json.loads(message.get_js_value().to_string())
    if phase == 'control':
        browser_positive = data
        phase = 'protected'
        view.load_html(protected_html, url + '/')
        return
    data.update(positiveControl=positive, browserPositiveControl=browser_positive, filePositiveControl=canary.read_text(), httpRequests=requests, fileCanaryPath=str(canary), engineSeconds=round(time.monotonic()-start,3))
    print(json.dumps(data), flush=True)
    Gtk.main_quit()
manager.connect('script-message-received::result', result)
def load_changed(_view, event):
    if event == WebKit2.LoadEvent.FINISHED:
        code = ("fetch('" + url + "/browser-positive').then(r=>r.text()).then(s=>window.webkit.messageHandlers.result.postMessage(JSON.stringify({text:s}))).catch(e=>window.webkit.messageHandlers.result.postMessage(JSON.stringify({error:String(e)})))") if phase == 'control' else engine + '\n' + script
        view.evaluate_javascript(code, -1, None, None, None, None, None)
view.connect('load-changed', load_changed)
GLib.timeout_add_seconds(60, lambda: (print(json.dumps({'status':'host-timeout','seconds':time.monotonic()-start}), flush=True), Gtk.main_quit(), False)[-1])
view.load_html('<body></body>', url + '/')
Gtk.main()
server.shutdown()
temporary.cleanup()
