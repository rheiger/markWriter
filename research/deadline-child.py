import gi, pathlib, sys

gi.require_version('Gtk', '3.0')
gi.require_version('WebKit2', '4.1')
from gi.repository import Gtk, WebKit2, GLib
manager = WebKit2.UserContentManager()
manager.register_script_message_handler('result')
window = Gtk.Window()
view = WebKit2.WebView.new_with_user_content_manager(manager)
window.add(view)
window.show_all()
engine = pathlib.Path('package/plantuml.js').read_text().replace('export{C as render,D as renderToString};','globalThis.mwRender = D;')
def result(_manager, message):
    value = message.get_js_value().to_string()
    print(value, flush=True)
    if value.startswith('OK:'):
        Gtk.main_quit()
manager.connect('script-message-received::result', result)
def load_changed(_view, event):
    if event == WebKit2.LoadEvent.FINISHED:
        if sys.argv[1] == 'stuck':
            script = "window.webkit.messageHandlers.result.postMessage('READY'); setTimeout(() => {while(true){}}, 0);"
        else:
            script = engine + "\nmwRender(['@startuml','Alice -> Bob : Recovered','@enduml'], s=>window.webkit.messageHandlers.result.postMessage('OK:' + (s.includes('Recovered') && s.includes('Alice') && s.includes('Bob'))), e=>window.webkit.messageHandlers.result.postMessage('ERR:'+e));"
        view.evaluate_javascript(script, -1, None, None, None, None, None)
view.connect('load-changed', load_changed)
GLib.timeout_add_seconds(20, lambda: (print('ERR:child timeout',flush=True), Gtk.main_quit(),False)[-1])
view.load_html('<body></body>', 'https://markwriter.invalid/')
Gtk.main()
