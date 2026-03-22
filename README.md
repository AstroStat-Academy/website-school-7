# Astrostatistics School Rome 2026 — Website

Static website hosted on GitHub Pages.

**Live site:** https://astrostat-academy.github.io/website-school-7/

---

## Updating the acknowledgement papers

The acknowledgements section displays a scrolling ticker of papers that cited the Summer School for Astrostatistics in Crete. The list is hardcoded in `index.html` (no runtime API calls, required for GitHub Pages compatibility).

To refresh the list before deploying:

```bash
python fetch_ack_papers.py
```

The script:
1. Queries the NASA ADS full-text index for papers containing `"Summer School for Astrostatistics in Crete"`
2. Renders each result as a card (author, year, title linked to ADS, journal)
3. Duplicates the card set for the seamless scroll loop
4. Patches the `<div class="ack-papers-track">` block in `index.html` in place

No external dependencies — uses only the Python standard library. Requires an internet connection and a valid ADS API token (set at the top of the script, `ADS_TOKEN`).

### Getting a new ADS token

If the token expires or needs replacing:
1. Go to [ui.adsabs.harvard.edu](https://ui.adsabs.harvard.edu) and log in
2. **My Account → Settings → API Token → Generate a new key**
3. Replace the `ADS_TOKEN` value at the top of `fetch_ack_papers.py`

---

## Application form — Google Apps Script backend

The application form in `apply.html` cannot submit directly to Google Forms from a static site (Google's `formResponse` endpoint requires a session-specific `fbzx` token that must come from a real Google-rendered form load, which is not possible cross-origin). Instead, submissions are routed through a **Google Apps Script web app** that writes directly to the response Google Sheet.

### Setting up the Apps Script web app

1. Open the Google Sheet linked to the application form
2. Go to **Extensions → Apps Script**
3. Delete any existing code and paste the following:

```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var p = e.parameter;
  sheet.appendRow([
    new Date(),
    p['entry.905896922'],   // Name
    p['entry.23336066'],    // Surname
    p['entry.312559857'],   // Email
    p['entry.1524207113'],  // Institution
    p['entry.997962685'],   // Academic status
    p['entry.1115227041'],  // Motivation
    p['entry.862831493'],   // Statistics comfort
    p['entry.84965604'],    // ML experience
    p['entry.1070820235'],  // Dietary restrictions
    p['entry.1156303946'],  // How did you discover
  ]);
  return ContentService.createTextOutput('OK');
}
```

4. Click **Deploy → New deployment**
5. Type: **Web app**
6. Set "Execute as": **Me**, "Who has access": **Anyone**
7. Click **Deploy** and copy the URL (format: `https://script.google.com/macros/s/.../exec`)

### Connecting the form

In `apply.html`, update the form `action` attribute and the `fetch` call in the script to point to the Apps Script URL obtained above. The form uses `fetch` with `mode: 'no-cors'` to POST the field values — no `fbzx` or other Google session tokens are needed.

### Re-deploying after code changes

If you modify the `doPost` function, you must create a **new deployment** (not update the existing one) for changes to take effect — Apps Script serves the version that was active at deploy time.
