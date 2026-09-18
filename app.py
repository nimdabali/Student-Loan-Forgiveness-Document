"""Local-only helper for the supplied Direct Consolidation PDF."""
import json
import re
import secrets
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import pymupdf

ROOT = Path(__file__).resolve().parent
PDF = ROOT / 'Consolidation-en-us.pdf'
TOKEN = secrets.token_urlsafe(32)


def schema():
    result = []
    seen = set()
    with pymupdf.open(PDF) as doc:
        for page in doc:
            for widget in page.widgets() or []:
                key = widget.field_name
                if key in seen or key in ["Borrower's Name", "Borrower's SSN"]:
                    continue
                seen.add(key)
                result.append({'key': key, 'label': widget.field_label or key,
                               'page': page.number + 1})
    return result


def render_pdf(values):
    allowed = {f['key'] for f in schema()} | {'First Name', 'SSN'}
    if not isinstance(values, dict) or any(k not in allowed or not isinstance(v, str) or len(v) > 3000 for k, v in values.items()):
        raise ValueError('Invalid form data.')
    ssn = values.get('SSN', '').strip()
    if ssn and not re.fullmatch(r'[0-9]{4}', ssn):
        raise ValueError('Enter exactly the last four digits of the SSN.')
    name = ' '.join(values.get(k, '').strip() for k in ['First Name', 'Middle Name', 'Last Name', 'Name Suffix'] if values.get(k, '').strip().upper() not in ['', 'N/A'])
    with pymupdf.open(PDF) as doc:
        for page in doc:
            for widget in list(page.widgets() or []):
                key, rect = widget.field_name, pymupdf.Rect(widget.rect)
                value = values.get(key, '').strip()
                if key == "Borrower's Name":
                    value = values.get('First Name', '') if page.number == 1 and rect.y0 > 400 else name
                elif key == "Borrower's SSN":
                    value = ssn
                page.delete_widget(widget)
                if not value:
                    continue
                # Flatten each occurrence independently: the source aliases first and full names.
                box = pymupdf.Rect(rect.x0 + 2, rect.y0 + 1, rect.x1 - 2, rect.y1)
                size = 10
                while size >= 6:
                    shape = page.new_shape()
                    if shape.insert_textbox(box, value, fontsize=size, fontname='helv', color=(0, 0, 0)) >= 0:
                        shape.commit()
                        break
                    size -= .5
                else:
                    raise ValueError(f'Text is too long for "{key}" on page {page.number + 1}. Please shorten it.')
            if page.number == 13 and name:
                # Item 31 is a printed line, not an interactive PDF field.
                box = pymupdf.Rect(183, 455, 571, 474)
                for size in [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6]:
                    shape = page.new_shape()
                    if shape.insert_textbox(box, name, fontsize=size, fontname='helv', color=(0, 0, 0)) >= 0:
                        shape.commit()
                        break
                else:
                    raise ValueError('Borrower name is too long for the signature line. Please shorten it.')
        return doc.tobytes(garbage=4, deflate=True)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, status, data, content_type):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/api/schema':
            self.respond(200, json.dumps({'fields': schema(), 'token': TOKEN}).encode(), 'application/json')
        elif self.path == '/original.pdf':
            self.respond(200, PDF.read_bytes(), 'application/pdf')
        elif self.path in ['/', '/app.js', '/style.css']:
            filename, kind = {'/': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'text/javascript'), '/style.css': ('style.css', 'text/css')}[self.path]
            self.respond(200, (ROOT / filename).read_bytes(), kind)
        else:
            self.respond(404, b'Not found', 'text/plain')

    def do_POST(self):
        if self.path != '/api/pdf' or self.headers.get('X-App-Token') != TOKEN:
            self.respond(403, b'Forbidden', 'text/plain')
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 500000:
                raise ValueError('Invalid request size.')
            result = render_pdf(json.loads(self.rfile.read(length)))
            self.respond(200, result, 'application/pdf')
        except (ValueError, TypeError) as error:
            self.respond(400, str(error).encode(), 'text/plain')


if __name__ == '__main__':
    try:
        server = ThreadingHTTPServer(('127.0.0.1', 8765), Handler)
    except OSError as error:
        raise SystemExit(f'Could not start the app on port 8765. Close any earlier app terminal and try again. Details: {error}')
    print('Open http://127.0.0.1:8765 — press Ctrl+C to stop.', flush=True)
    # Browser preconnections must not block asset/API requests. Opening the
    # browser must also never prevent the server from starting its request loop.
    threading.Thread(target=webbrowser.open, args=('http://127.0.0.1:8765',), daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nApp stopped.')
    finally:
        server.server_close()
