# Consolidation Form Companion

Public app: https://nimdabali.github.io/Student-Loan-Forgiveness-Document/

The GitHub Pages version generates PDFs entirely in the visitor's browser. Saved profiles stay in that browser and are stored unencrypted. SSN saving is optional. When automatic Google Sheets export is enabled, borrower, reference, loan, and payment details are sent to the configured spreadsheet through Google's API; SSN export is a separate opt-in. Localhost profiles do not automatically transfer to the public website.

## Google Sheets and payments

Click **Connect Google Sheets** and sign in with an account that can edit the configured spreadsheet. Google Sheets API must be enabled in the OAuth project's Google Cloud console, and the account must be an authorized test user while the project is in testing. Authorized JavaScript origins must include `https://nimdabali.github.io` and, for local use, `http://localhost:8765` or `http://127.0.0.1:8765`.

Automatic export appends one record after each successful PDF generation to the existing tab with `gid=0`. It initializes column headers on a blank first row and checks existing headers before writing. It never creates another spreadsheet. Payment amount, installments, and calendar dates are saved with profiles. The total payment amount, selected payment status (Pending or Cleared), and payment dates in MM/DD/YYYY format are printed on one added final PDF page. Status defaults to Pending and is saved with the profile. With no payment dates, the PDF stays at 34 pages. Optional dummy card number, expiry, and cardholder name fields are saved with profiles and exported as text to Google Sheets, but excluded from PDFs. Use synthetic test data only. Existing export sheets gain these three columns on the next export.

Access tokens stay in memory. Reconnect after reloading the page or when the Google session expires. If export fails, the PDF remains downloaded: use **Retry pending export** before closing the page. The pending record stays only in memory; retries check its unique ID before appending. Do not edit the Export ID column. Concurrent clients are not transactionally coordinated. Uncheck automatic export when you intentionally want a PDF-only download.

Run `node test_sheets.js` for mocked Google API checks. Live consent and a real export must also be verified by the spreadsheet owner.

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
