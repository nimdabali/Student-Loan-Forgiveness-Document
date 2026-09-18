# Consolidation Form Companion

Public app: https://nimdabali.github.io/Student-Loan-Forgiveness-Document/

The GitHub Pages version runs entirely in the visitor's browser. Entered details are not uploaded to a PDF server. Saved profiles stay in that browser and are stored unencrypted. SSN saving is optional. Localhost profiles do not automatically transfer to the public website.

## Use the app

Enter borrower, reference, and loan details. Save a named profile to reuse them. Download the filled PDF and review the original instructions and any separate required forms. Full SSNs display as 123-45-6789; four-digit entries display as XXX-XX-6789. The borrower name is printed on the signature line. The original 34-page PDF is preserved.

## Run locally

Run `python -m pip install -r requirements.txt`, then `python app.py`, or double-click **Start App.bat**. Open http://127.0.0.1:8765 and keep the terminal open.

## Update the public site

1. Edit the root app files.
2. Run `python build_pages.py` to refresh the static site in `docs/`.
3. Commit and push the changed source files and `docs/` to `main`.

GitHub Pages must be configured to publish from the `main` branch, `/docs` folder. The build copies only application assets, the blank source PDF, a blank flattened template, and field metadata. It does not publish saved profiles or test outputs.

PDF generation uses the bundled pdf-lib 1.17.1 library; its license is in `vendor/pdf-lib.LICENSE.md`. Python/PyMuPDF builds the template and supports the original local API. Run `python -m unittest test_app.py` for backend checks.
