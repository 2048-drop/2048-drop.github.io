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

URL=""; EMAIL=""; PUB=""; HOST=""; RAIL=""; ARTICLE=""; BOTTOM=""; H5=""; BUMP=""; TEST=""
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
    --bump)         BUMP="1"; shift ;;
    --test)         TEST="${2:-}"; shift 2 ;;
    -h|--help)      sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

URL="$URL" EMAIL="$EMAIL" PUB="$PUB" HOST="$HOST" \
RAIL="$RAIL" ARTICLE="$ARTICLE" BOTTOM="$BOTTOM" H5="$H5" BUMP="$BUMP" TEST="$TEST" python3 - <<'PY'
import os, re, glob, sys

url     = os.environ['URL'].rstrip('/')
email   = os.environ['EMAIL']
pub     = os.environ['PUB']
host    = os.environ['HOST'] or 'GitHub Pages'
slots   = {'rail': os.environ['RAIL'], 'article': os.environ['ARTICLE'], 'bottom': os.environ['BOTTOM']}
h5      = os.environ['H5'] == '1'
changed = []

PAGES = ['index.html','how-to-play.html','about.html','privacy.html','terms.html']

_ads = open('ads.js').read()
h5_on   = h5 or re.search(r'  h5GamesAds: *true', _ads) is not None
_test   = os.environ.get('TEST','').lower()
test_on = (_test == 'on') if _test in ('on','off') else (re.search(r'  testMode: *true', _ads) is not None)

# Whatever base URL the site currently carries, so re-pointing an already
# configured site to a new domain works, not just the first run.
m = re.search(r'<link rel="canonical" href="([^"]+?)/?"', open('index.html').read())
old_base = (m.group(1).rstrip('/') if m else 'https://example.github.io/2048-drop')

if pub and not re.fullmatch(r'ca-pub-\d{16}', pub):
    sys.exit("--pub must look like ca-pub-1234567890123456 (got: %s)" % pub)

# ---------------------------------------------------------------- pages
for f in PAGES:
    s = orig = open(f).read()

    if url:
        s = s.replace(old_base + '/' + f, url + '/' + f)
        s = s.replace(old_base + '/', url + '/')
        s = s.replace(old_base, url)
        s = s.replace('[YOUR SITE URL]', url)
    if email:
        s = s.replace('[YOUR CONTACT EMAIL]', email)
    if host:
        s = s.replace('[YOUR HOST — e.g. GitHub Pages]', host)

    # strip the "before you publish" reminder boxes
    s = re.sub(r'\n<div class="callout">\s*\n\s*<p><strong>Before you publish:.*?</div>\n',
               '\n', s, flags=re.S)

    # AdSense verification meta + the loader snippet, in <head> on every page.
    # Google's own instructions say to put the script in the head, and site
    # review is more reliable when it is literally there rather than injected.
    if pub:
        s = re.sub(r'\n<meta name="google-adsense-account"[^>]*>', '', s)
        s = re.sub(r'\n<script async src="https://pagead2\.googlesyndication\.com[^>]*></script>', '', s)
        # H5 Games Ads serves test ads only while data-adbreak-test is present.
        test_attr = ' data-adbreak-test="on"' if (h5_on and test_on) else ''
        snippet = ('\n<meta name="google-adsense-account" content="%s">'
                   '\n<script async src="https://pagead2.googlesyndication.com/pagead/js/'
                   'adsbygoogle.js?client=%s"%s crossorigin="anonymous"></script>'
                   % (pub, pub, test_attr))
        s = re.sub(r'(<meta name="theme-color" content="[^"]*">)', lambda m: m.group(1) + snippet, s, count=1)

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
    s = re.sub(r'(  rewardsWithoutAds: *)true', r'\1false', s)
if _test in ('on','off'):
    s = re.sub(r'(  testMode: *)(true|false)', lambda m: m.group(1) + ('true' if _test=='on' else 'false'), s)
if s != orig:
    open('ads.js','w').write(s); changed.append('ads.js')

# ------------------------------------------------- robots / sitemap / ads.txt
for f in ['robots.txt','sitemap.xml']:
    s = orig = open(f).read()
    if url:
        s = s.replace(old_base, url)
    if s != orig:
        open(f,'w').write(s); changed.append(f)

if pub:
    open('ads.txt','w').write(
        "# ads.txt - authorised digital sellers\n"
        "google.com, %s, DIRECT, f08c47fec0942fa0\n" % pub.replace('ca-','')
    )
    changed.append('ads.txt')

# ------------------------------------------------------- cache busting
# GitHub Pages serves assets with cache-control: max-age=600, so a returning
# visitor can sit on a stale stylesheet for ten minutes after a deploy. Version
# the asset URLs by content hash: the URL only changes when the file does.
import hashlib
ASSETS = ['style.css','game.js','ads.js']
vers = {a: hashlib.md5(open(a,'rb').read()).hexdigest()[:8] for a in ASSETS}
for f in PAGES:
    s = orig = open(f).read()
    for a, v in vers.items():
        s = re.sub(r'(href|src)="' + re.escape(a) + r'(\?v=[0-9a-f]+)?"',
                   lambda m, a=a, v=v: '%s="%s?v=%s"' % (m.group(1), a, v), s)
    if s != orig:
        open(f,'w').write(s)
        if f not in changed: changed.append(f)
print("asset versions: " + ", ".join("%s?v=%s" % (a, v) for a, v in vers.items()))

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

if url:
    stale = [f for f in PAGES + ['robots.txt','sitemap.xml']
             if url not in open(f).read() or (old_base != url and old_base in open(f).read())]
    if stale:
        print("\nWARNING: these files still carry the old URL: " + ", ".join(stale))
    else:
        print("all pages, robots.txt and sitemap.xml now point at " + url)

print("\nads.js: client=%s  slots=%s  placeholders=%s  h5GamesAds=%s  testMode=%s  rewardsWithoutAds=%s" % (
    (re.search(r"  client: '([^']*)'", open('ads.js').read()).group(1) or '(unset)'),
    ','.join(v or '-' for v in slots.values()) if any(slots.values()) else '(unset)',
    re.search(r'  showPlaceholders: *(\w+)', open('ads.js').read()).group(1),
    re.search(r'  h5GamesAds: *(\w+)', open('ads.js').read()).group(1),
    re.search(r'  testMode: *(\w+)', open('ads.js').read()).group(1),
    re.search(r'  rewardsWithoutAds: *(\w+)', open('ads.js').read()).group(1)))
PY
