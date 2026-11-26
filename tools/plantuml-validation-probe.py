# Direct WebKitGTK validation Worker probe, not installed-app acceptance.
import gi, hashlib, json, pathlib, sys, threading, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

gi.require_version('Gtk', '3.0')
gi.require_version('WebKit2', '4.1')
from gi.repository import Gtk, WebKit2, GLib
bundle = pathlib.Path(sys.argv[1]).read_bytes()
# Synthetic test wrapper reports entry then blocks. Production bytes are tested
# separately; the controlled-timeout wrapper does not claim normal latency.
hold = bundle + b";{let old=self.onmessage;self.onmessage=e=>{if(e.data.__controlledDelay){self.postMessage({entered:true});let until=Date.now()+8000;while(Date.now()<until){}}else old(e)}}"
policy = "default-src 'none'; script-src 'self'; connect-src 'none'; img-src 'none'; style-src 'none'; font-src 'none'; worker-src 'none'; object-src 'none'"
requests = []
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        requests.append(self.path)
        data = {'/validation.js':bundle, '/validation-hold.js':hold, '/positive':b'PI222_CANARY'}.get(self.path)
        self.send_response(200 if data is not None else 404)
        self.send_header('Content-Type', 'application/javascript')
        self.send_header('Content-Security-Policy', policy)
        self.end_headers()
        if data is not None: self.wfile.write(data)
    def log_message(self, *_): pass
server = HTTPServer(('127.0.0.1',0), Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
base='http://127.0.0.1:'+str(server.server_port)
positive=urllib.request.urlopen(base+'/positive',timeout=2).read().decode()
manager=WebKit2.UserContentManager();manager.register_script_message_handler('result')
window=Gtk.Window();view=WebKit2.WebView.new_with_user_content_manager(manager);window.add(view);window.show_all()
passed=False
def result(_manager,message):
    global passed
    data=json.loads(message.get_js_value().to_string())
    cases=data.get('cases',[]);timeout=data.get('controlledTimeout',{})
    passed=(len(cases)==9 and all(c['ok']==c['expected'] and c['safe'] for c in cases) and timeout.get('entered') and timeout.get('ticks',0)>0 and timeout.get('sourceVisible') and timeout.get('nextSvg') and requests==['/positive','/validation.js','/validation-hold.js','/validation.js'])
    data.update(passed=bool(passed),requests=requests,positiveControl=positive,bundleBytes=len(bundle),bundleSha256=hashlib.sha256(bundle).hexdigest(),holdSha256=hashlib.sha256(hold).hexdigest(),workerPolicy=policy)
    print(json.dumps(data),flush=True);Gtk.main_quit()
manager.connect('script-message-received::result',result)
def loaded(_view,event):
    if event==WebKit2.LoadEvent.FINISHED:
        fixtures=pathlib.Path('frontend/src/lib/fixtures/plantuml')
        inputs={'sequence':(fixtures/'sequence.svg').read_text(),'klass':(fixtures/'class.svg').read_text()}
        script=pathlib.Path('tools/plantuml-validation-probe.js').read_text().replace('__INPUTS__',json.dumps(inputs))
        view.evaluate_javascript(script,-1,None,None,None,None,None)
view.connect('load-changed',loaded)
GLib.timeout_add_seconds(60,lambda:(print(json.dumps({'fatal':'probe timeout'}),flush=True),Gtk.main_quit(),False)[-1])
docpolicy="default-src 'self'; connect-src 'self' ipc: http://localhost:5173 ws://localhost:5173 https://asset.localhost; img-src 'self' asset: https://asset.localhost data:; style-src 'self' 'unsafe-inline'; font-src 'self' asset: https://asset.localhost; script-src 'self' 'unsafe-inline';"
view.load_html('<meta http-equiv="Content-Security-Policy" content="'+docpolicy+'"><pre></pre>',base+'/')
Gtk.main();server.shutdown()
if not passed: sys.exit(1)
