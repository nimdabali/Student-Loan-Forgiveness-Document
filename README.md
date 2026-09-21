# Consolidation Form Companion

Public app: https://nimdabali.github.io/Student-Loan-Forgiveness-Document/

The GitHub Pages version runs entirely in the visitor's browser. Entered details are not uploaded to a PDF server. Saved profiles stay in that browser and are stored unencrypted. SSN saving is optional. Localhost profiles do not automatically transfer to the public website.

## Use the app

Enter borrower, reference, and loan details. Save a named profile to reuse them. Download the filled PDF and review the original instructions and any separate required forms. Full SSNs display as 123-45-6789; four-digit entries display as XXX-XX-6789. The borrower name is printed on the signature line. The original 34-page PDF is preserved.

## Run locally

Use **Upload text file** to import one borrower's `.txt` file into a new, unsaved profile. Each line should use `Field name: value` (or `Field name = value`). Common labels include `First Name`, `Last Name`, `DOB`, `SSN`, `Email`, `Phone`, `Address`, `City`, `State`, and `Zip`. Use **Download text template** for all supported fields, including references and loans. Files are processed in the browser. Unrecognized or invalid lines are reported; repeated fields are rejected to avoid combining users. Review the results and save a separate named profile for each user. Free-form prose is not supported.

Run `node test_text_import.js` for importer checks.

NSLDS student-aid `.txt` exports are also supported directly. The importer fills borrower contact details and lists loans with outstanding principal or interest. Select **Add to loans to consolidate** or **Add to other loans** for each desired loan. Zero-balance loans are omitted. Imported amounts are reported principal plus interest, not current payoff quotes. Verify the amounts and enter the application’s loan codes and servicer account numbers manually; award IDs are not substituted for account numbers. Missing SSN, birth date, employer, and reference information stays blank. Import results are temporary; save the profile after adding loans to retain the populated form fields.

Run `python -m pip install -r requirements.txt`, then `python app.py`, or double-click **Start App.bat**. Open http://127.0.0.1:8765 and keep the terminal open.

## Update the public site

1. Edit the root app files.
2. Run `python build_pages.py` to refresh the static site in `docs/`.
3. Commit and push the changed source files and `docs/` to `main`.

GitHub Pages must be configured to publish from the `main` branch, `/docs` folder. The build copies only application assets, the blank source PDF, a blank flattened template, and field metadata. It does not publish saved profiles or test outputs.

PDF generation uses the bundled pdf-lib 1.17.1 library; its license is in `vendor/pdf-lib.LICENSE.md`. Python/PyMuPDF builds the template and supports the original local API. Run `python -m unittest test_app.py` for backend checks.
