import unittest
import json
import socket
import threading
import urllib.request
from http.server import ThreadingHTTPServer
import pymupdf
from app import Handler, TOKEN, render_pdf, schema


class PDFTests(unittest.TestCase):
    def test_repeated_identity_and_original_pages(self):
        data = {'First Name': 'Alex', 'Middle Name': 'Morgan', 'Last Name': 'Sample', 'SSN': '0123'}
        with pymupdf.open(stream=render_pdf(data), filetype='pdf') as doc:
            self.assertEqual(len(doc), 34)
            for page in list(doc)[1:14]:
                self.assertIn('Alex Morgan Sample', page.get_text())
                self.assertIn('0123', page.get_text())
            self.assertEqual(doc[1].get_textbox(pymupdf.Rect(118, 487, 572, 506)).strip(), 'Alex')
            self.assertEqual(doc[1].get_textbox(pymupdf.Rect(185, 634, 572, 653)).strip(), '0123')
            self.assertEqual(doc[13].get_textbox(pymupdf.Rect(183, 455, 571, 474)).strip(), 'Alex Morgan Sample')
            self.assertTrue(all(not list(p.widgets() or []) for p in doc))

    def test_every_field_filled(self):
        data = {f['key']: 'TEST' for f in schema()}
        with pymupdf.open(stream=render_pdf(data), filetype='pdf') as doc:
            self.assertEqual(sum(p.get_text().count('TEST') for p in doc), len(schema()) + 14*3)

    def test_invalid_and_overflow_rejected(self):
        for data in [{'SSN':'123'}, {'SSN':'123456789'}, {'SSN':'123-45-6789'}, {'SSN':'abcd'}, {'First Name':42}, {'unknown':'test'}, {'Last Name':'W'*1000}]:
            with self.assertRaises(ValueError):
                render_pdf(data)


class ServerTests(unittest.TestCase):
    def test_idle_browser_connection_does_not_block_app(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        idle = socket.create_connection(server.server_address)
        base = f'http://127.0.0.1:{server.server_port}'
        try:
            for path in ['/', '/app.js', '/style.css', '/api/schema']:
                with urllib.request.urlopen(base + path, timeout=3) as response:
                    self.assertEqual(response.status, 200)
                    self.assertTrue(response.read())
            request = urllib.request.Request(base + '/api/pdf',
                data=json.dumps({'First Name': 'Alex', 'SSN': '0123'}).encode(),
                headers={'X-App-Token': TOKEN, 'Content-Type': 'application/json'})
            with urllib.request.urlopen(request, timeout=5) as response:
                self.assertTrue(response.read().startswith(b'%PDF'))
        finally:
            idle.close()
            server.shutdown()
            server.server_close()
            worker.join(timeout=3)


if __name__ == '__main__':
    unittest.main()
