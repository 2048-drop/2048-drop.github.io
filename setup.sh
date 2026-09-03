#!/usr/bin/env bash
# =====================================================================
# 2048 Drop — one-shot configuration for going live.
#
# Replaces every placeholder across all five pages, robots.txt, sitemap.xml
# and ads.txt, and flips the production flags in ads.js.
#
#   ./setup.sh --url https://yourdomain.com --email you@example.com
#   ./setup.sh --url ... --email ... --pub ca-pub-1234567890123456 \
#              --slot-rail 111 --slot-article 222 --slot-bottom 333
#   ./setup.sh --h5                # after H5 Games Ads is approved
#
# Safe to run more than once.
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")"

URL=""; EMAIL=""; PUB=""; HOST=""; RAIL=""; ARTICLE=""; BOTTOM=""; H5=""
while [ $# -gt 0 ]; do
  case "$1" in
    --url)          URL="${2:-}"; shift 2 ;;
    --email)        EMAIL="${2:-}"; shift 2 ;;
    --pub)          PUB="${2:-}"; shift 2 ;;
    --host)         HOST="${2:-}"; shift 2 ;;
    --slot-rail)    RAIL="${2:-}"; shift 2 ;;
    --slot-article) ARTICLE="${2:-}"; shift 2 ;;
    --slot-bottom)  BOTTOM="${2:-}"; shift 2 ;;
    --h5)           H5="1"; shift ;;
    -h|--help)      sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

URL="$URL" EMAIL="$EMAIL" PUB="$PUB" HOST="$HOST" \
RAIL="$RAIL" ARTICLE="$ARTICLE" BOTTOM="$BOTTOM" H5="$H5" python3 - <<'PY'
import os, re, glob, sys

url     = os.environ['URL'].rstrip('/')
email   = os.environ['EMAIL']
pub     = os.environ['PUB']
host    = os.environ['HOST'] or 'GitHub Pages'
slots   = {'rail': os.environ['RAIL'], 'article': os.environ['ARTICLE'], 'bottom': os.environ['BOTTOM']}
h5      = os.environ['H5'] == '1'
changed = []

PAGES = ['index.html','how-to-play.html','about.html','privacy.html','terms.html']

if pub and not re.fullmatch(r'ca-pub-\d{16}', pub):
    sys.exit("--pub must look like ca-pub-1234567890123456 (got: %s)" % pub)

# ---------------------------------------------------------------- pages
for f in PAGES:
    s = orig = open(f).read()

    if url:
        s = s.replace('https://example.github.io/2048-drop/' + f, url + '/' + f)
        s = s.replace('https://example.github.io/2048-drop/', url + '/')
        s = s.replace('[YOUR SITE URL]', url)
    if email:
        s = s.replace('[YOUR CONTACT EMAIL]', email)
    if host:
        s = s.replace('[YOUR HOST — e.g. GitHub Pages]', host)

    # strip the "before you publish" reminder boxes
    s = re.sub(r'\n<div class="callout">\s*\n\s*<p><strong>Before you publish:.*?</div>\n',
               '\n', s, flags=re.S)

    # AdSense site-verification meta, right after theme-color
    if pub:
        s = re.sub(r'\n<meta name="google-adsense-account"[^>]*>', '', s)
        s = s.replace('<meta name="theme-color" content="#0e0e15">',
                      '<meta name="theme-color" content="#0e0e15">\n'
                      '<meta name="google-adsense-account" content="%s">' % pub)

    if s != orig:
        open(f,'w').write(s); changed.append(f)

# ---------------------------------------------------------------- ads.js
s = orig = open('ads.js').read()
if pub:
    s = re.sub(r"(  client: )'[^']*'", r"\1'%s'" % pub, s)
for k, v in slots.items():
    if v:
        s = re.sub(r"(    %s:\s*)'[^']*'" % k, lambda m, v=v: m.group(1) + "'%s'" % v, s)

live = bool(pub) and all(slots.values())
if live:
    s = re.sub(r'(  testMode: *)true', r'\1false', s)
    s = re.sub(r'(  showPlaceholders: *)true', r'\1false', s)
if h5:
    s = re.sub(r'(  h5GamesAds: *)false', r'\1true', s)
    s = re.sub(r'(  simulateRewards: *)true', r'\1false', s)
if s != orig:
    open('ads.js','w').write(s); changed.append('ads.js')

# ------------------------------------------------- robots / sitemap / ads.txt
for f in ['robots.txt','sitemap.xml']:
    s = orig = open(f).read()
    if url:
        s = s.replace('https://example.github.io/2048-drop', url)
    if s != orig:
        open(f,'w').write(s); changed.append(f)

if pub:
    open('ads.txt','w').write(
        "# ads.txt - authorised digital sellers\n"
        "google.com, %s, DIRECT, f08c47fec0942fa0\n" % pub.replace('ca-','')
    )
    changed.append('ads.txt')

# ---------------------------------------------------------------- report
print("updated: " + (", ".join(sorted(set(changed))) if changed else "nothing (already configured?)"))

leftover = []
for f in PAGES:
    for m in set(re.findall(r'\[[A-Z][^\]]{3,40}\]', open(f).read())):
        leftover.append(f + ' -> ' + m)
if leftover:
    print("\nSTILL PLACEHOLDER (AdSense will reject these):")
    for l in sorted(set(leftover)): print("  " + l)
else:
    print("no placeholders left in any page.")

if url and 'example.github.io' in "".join(open(f).read() for f in PAGES + ['robots.txt','sitemap.xml']):
    print("\nWARNING: 'example.github.io' still appears somewhere.")

print("\nads.js: client=%s  slots=%s  placeholders=%s  h5GamesAds=%s" % (
    (re.search(r"  client: '([^']*)'", open('ads.js').read()).group(1) or '(unset)'),
    ','.join(v or '-' for v in slots.values()) if any(slots.values()) else '(unset)',
    re.search(r'  showPlaceholders: *(\w+)', open('ads.js').read()).group(1),
    re.search(r'  h5GamesAds: *(\w+)', open('ads.js').read()).group(1)))
PY
