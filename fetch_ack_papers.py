#!/usr/bin/env python3
"""
Fetch papers that acknowledged the Summer School for Astrostatistics in Crete
from NASA ADS and update the acknowledgements section in index.html.

Usage:
    python fetch_ack_papers.py
"""

import json
import re
import urllib.request
import urllib.parse

ADS_TOKEN = "HU13ZGGhcGMy5wFQS9AFeW2y0FFQcQ4eDioCQAyT"
QUERY     = 'full:"Summer School for Astrostatistics in Crete"'
ADS_BASE  = "https://ui.adsabs.harvard.edu/abs/"

def fetch_papers():
    params = urllib.parse.urlencode({
        "q":    QUERY,
        "fl":   "title,author,year,bibcode,pub",
        "rows": 100,
        "sort": "year desc",
    })
    url = f"https://api.adsabs.harvard.edu/v1/search/query?{params}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {ADS_TOKEN}"})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    return data["response"]["docs"]

def format_authors(authors):
    if not authors:
        return "?"
    last = authors[0].split(",")[0]
    if len(authors) == 2:
        last2 = authors[1].split(",")[0]
        return f"{last} &amp; {last2}"
    if len(authors) > 2:
        return f"{last} et al."
    return last

def render_card(doc, aria_hidden=False):
    authors = format_authors(doc.get("author", []))
    year    = doc.get("year", "")
    title   = (doc.get("title") or ["Untitled"])[0]
    pub     = doc.get("pub", "")
    bibcode = doc.get("bibcode", "")
    url     = ADS_BASE + bibcode
    hidden  = ' aria-hidden="true"' if aria_hidden else ""
    tabidx  = ' tabindex="-1"' if aria_hidden else ""
    return (
        f'            <div class="ack-paper-item"{hidden}>'
        f'<span class="ack-paper-authors">{authors} ({year})</span>'
        f'<a class="ack-paper-title" href="{url}" target="_blank" rel="noopener"{tabidx}>{title}</a>'
        f'<span class="ack-paper-pub">{pub}</span>'
        f'</div>'
    )

def build_track_html(docs):
    lines = []
    # first set
    for doc in docs:
        lines.append(render_card(doc))
    # duplicate for seamless loop
    lines.append("            <!-- duplicate for seamless loop -->")
    for doc in docs:
        lines.append(render_card(doc, aria_hidden=True))
    return "\n".join(lines)

def update_html(track_html):
    with open("index.html", "r", encoding="utf-8") as f:
        content = f.read()

    pattern = r'(<div class="ack-papers-track">).*?(</div>\s*</div>\s*</div>\s*</div>\s*<!-- SPONSORS -->)'
    replacement = (
        '<div class="ack-papers-track">\n'
        + track_html
        + '\n          </div>\n        </div>\n      </div>\n    </div>\n  </section>\n\n  <!-- SPONSORS -->'
    )

    # More targeted: replace content between track open and closing </div> of ticker
    pattern = r'(<div class="ack-papers-track">)(.*?)(</div>\s*</div>(\s*</div>\s*</div>\s*<!-- SPONSORS -->))'
    new_content = re.sub(
        r'(<div class="ack-papers-track">).*?(</div>\n        </div>\n      </div>\n    </div>\n  </section>)',
        f'<div class="ack-papers-track">\n{track_html}\n          </div>\n        </div>\n      </div>\n    </div>\n  </section>',
        content,
        flags=re.DOTALL,
    )

    if new_content == content:
        print("WARNING: pattern not matched — index.html was not updated.")
        return

    with open("index.html", "w", encoding="utf-8") as f:
        f.write(new_content)
    print("index.html updated successfully.")

def main():
    print("Fetching papers from NASA ADS...")
    docs = fetch_papers()
    print(f"Found {len(docs)} papers.")
    track_html = build_track_html(docs)
    update_html(track_html)

if __name__ == "__main__":
    main()
