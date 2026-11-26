from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import sys

root, port_file, request_file = map(Path, sys.argv[1:])
page_csp = "default-src 'self'; connect-src 'self' ipc: http://localhost:5173 ws://localhost:5173 https://asset.localhost; img-src 'self' asset: https://asset.localhost data:; style-src 'self' 'unsafe-inline'; font-src 'self' asset: https://asset.localhost; script-src 'self' 'unsafe-inline';"
worker_csp = "default-src 'none'; script-src 'self'; connect-src 'none'; img-src 'none'; style-src 'none'; font-src 'none'; worker-src 'none'; object-src 'none'"

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        with request_file.open('a') as record:
            record.write(self.path + '\n')
        if self.path == '/worker.js':
            body, mime, policy = (root / 'worker.js').read_bytes(), 'application/javascript', worker_csp
        elif self.path == '/':
            body, mime, policy = b'<!doctype html><meta charset="utf-8"><body><pre></pre></body>', 'text/html', page_csp
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Security-Policy', policy)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass

server = HTTPServer(('127.0.0.1', 0), Handler)
port_file.write_text(str(server.server_port))
server.serve_forever()
