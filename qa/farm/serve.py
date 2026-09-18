import http.server, socketserver, os
ROOT='/home/claude/farm'
STUB=open('/home/claude/stub.png','rb').read()
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**k): super().__init__(*a,directory=ROOT,**k)
    def do_GET(self):
        if self.path.startswith('/api/asset-studio'):
            import os as _o
            kind=self.path.rsplit('/',1)[-1].split('?')[0]
            f='/home/claude/icons_t/%s-3d.png'%kind
            data=open(f,'rb').read() if _o.path.exists(f) else STUB
            self.send_response(200); self.send_header('Content-Type','image/png')
            self.send_header('Content-Length',str(len(data))); self.end_headers()
            self.wfile.write(data); return
        return super().do_GET()
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
with socketserver.TCPServer(("127.0.0.1",8099),H) as s: s.serve_forever()
