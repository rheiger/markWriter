from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import sys

port_file, request_file = map(Path, sys.argv[1:])

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        with request_file.open('a') as record:
            record.write(self.path + '\n')
        body = b'SYNTHETIC-PLANTUML-SECRET'
        self.send_response(200)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass

server = HTTPServer(('127.0.0.1', 0), Handler)
port_file.write_text(str(server.server_port))
server.serve_forever()
