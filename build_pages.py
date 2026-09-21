"""Build the static GitHub Pages site with no user data or Python runtime."""
import json
import hashlib
import shutil
from pathlib import Path
import pymupdf
from app import schema

ROOT = Path(__file__).resolve().parent
DEST = ROOT / 'docs'


def build():
    DEST.mkdir(exist_ok=True)
    for filename in ['index.html', 'style.css', 'app.js', 'text-import.js', 'pdf-browser.js', 'Consolidation-en-us.pdf']:
        shutil.copyfile(ROOT / filename, DEST / filename)
    shutil.copytree(ROOT / 'vendor', DEST / 'vendor', dirs_exist_ok=True)
    slots = []
    with pymupdf.open(ROOT / 'Consolidation-en-us.pdf') as doc:
        for page in doc:
            for widget in list(page.widgets() or []):
                key = widget.field_name
                if key == "Borrower's Name" and page.number == 1 and widget.rect.y0 > 400:
                    key = 'First Name'
                slots.append({'key': key, 'page': page.number, 'rect': list(widget.rect)})
                page.delete_widget(widget)
        slots.append({'key': "Borrower's Name", 'page': 13, 'rect': [181, 454, 573, 474]})
        doc.save(DEST / 'template.pdf', garbage=4, deflate=True)
    (DEST / 'schema.json').write_text(json.dumps({'fields': schema(), 'slots': slots}), encoding='utf-8')
    # A changed asset gets a new URL, preventing new markup from using cached JS.
    html = (DEST / 'index.html').read_text(encoding='utf-8')
    for filename in ['style.css', 'app.js', 'text-import.js', 'pdf-browser.js', 'vendor/pdf-lib.min.js']:
        version = hashlib.sha256((DEST / filename).read_bytes()).hexdigest()[:12]
        html = html.replace(f'./{filename}"', f'./{filename}?v={version}"')
    (DEST / 'index.html').write_text(html, encoding='utf-8')
    (DEST / '.nojekyll').touch()


if __name__ == '__main__':
    build()
    print('GitHub Pages site built in docs/')
