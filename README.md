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
