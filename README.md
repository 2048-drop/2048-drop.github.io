# 2048 Drop

A falling-block puzzle that crosses the block-drop format with the merge maths of 2048.
Numbered blocks fall down a five-column well; land one touching a matching number and
they fuse into double the value. Merges open gaps, gravity collapses the stack, and new
matches form — chains pay a multiplier.

**Zero dependencies.** Static HTML, CSS and JS. No build step, no npm, no framework,
nothing fetched from a CDN.

## Files

```
index.html        the game
how-to-play.html  full strategy guide
about.html        what it is, how it was built, how it is funded
privacy.html      privacy policy          <- required by AdSense
terms.html        terms of use
style.css         all styling, three themes
game.js           game engine
ads.js            ad slots, consent banner, rewarded video
ads.txt           authorised sellers      <- required by AdSense
robots.txt, sitemap.xml
setup.sh          one-shot go-live configuration
```

## Controls

| Input | Action |
|---|---|
| `←` `→` | Steer the falling block |
| `↓` (or `↑` / `Space`) | Drop straight to the floor, +2 points per row |
| `C` | Hold the block, or swap with the held one |
| `1` `2` `3` | Bomb · Wild block · Undo |
| `P` / `R` | Pause / restart |
| Swipe, tap, swipe up | Steer, drop, hold — on mobile |

## Features

- **Landing preview** — dashed outline of where the block will rest, green when it will merge
- **Hold slot** and a **three-block queue**
- **Power-ups** — bomb (clears 3×3, scores what it destroys), wild block (takes its
  strongest neighbour's value, guaranteeing a merge), undo (reverts the last drop).
  One of each to start, one more every 2,500 points
- **Daily Challenge** — a date-seeded block sequence, identical for every player
- **Three modes** — Chill, Classic, Blitz
- **16 achievements**, lifetime statistics, and a personal top-ten table
- **Three themes** — Midnight, Aurora, Paper — plus sound toggle
- Cascade particles, screen shake, danger tint on the top rows
- Everything stored locally; no account, no server, no analytics

## The rules engine

Settling the board is one loop: apply gravity until nothing moves, find every
non-overlapping pair of touching equal blocks, merge them all at once, repeat. Vertical
pairs merge downward, horizontal pairs merge left. Each pass is one chain link, and a
merge scores its value times its link number.

The loop maintains one invariant: **a settled board never contains two touching blocks of
equal value, and no block floats above an empty cell.** That was verified by simulating
400 complete games headlessly and asserting it after every drop, and again by driving the
real page in headless Chrome and reading the invariant back out of the live DOM.

## Hosting on GitHub Pages

```bash
gh repo create 2048-drop --public --source=. --remote=origin --push
```

Then **Settings → Pages → Deploy from a branch → `main` / `root` → Save.** Live at
`https://<username>.github.io/2048-drop/` in about a minute.

Then replace `example.github.io` with the real URL in: the `<link rel="canonical">` and
`og:url` tags of all five pages, `robots.txt`, and `sitemap.xml`.

### Custom domain

Strongly recommended before applying to AdSense — a `github.io` subdomain is approvable
but a real domain reviews better.

1. Buy a domain, add a `CNAME` file at the repo root containing just the domain.
2. Point apex `A` records at `185.199.108.153`, `.109.153`, `.110.153`, `.111.153`,
   and `www` `CNAME` at `<username>.github.io`.
3. Settings → Pages → Custom domain → **Enforce HTTPS**.

---

# Monetisation

## Read this first

Two rules decide whether you keep your AdSense account.

**1. Never reward, ask for, or hint at ad CLICKS.** "Click the ad for a power-up",
"support us by clicking", an arrow pointing at a banner — all of it is invalid traffic
under the AdSense programme policies, and the penalty is permanent termination with your
unpaid balance refunded to advertisers. There is no small safe amount of this.

**2. Rewarding a player for WATCHING a rewarded video is allowed** — but only through a
rewarded ad product. On the web that is **Google H5 Games Ads**, which you apply for from
inside AdSense. A standard display unit can never be used this way. That is what this
game uses for Second Chance and the power-up refill.

## The 150px rule

Display ads must sit far enough from interactive game elements that a player cannot hit
one by accident while playing. 150px is the figure Google's game-monetisation guidance
uses, and accidental-click complaints are a common suspension trigger.

This is enforced structurally, not by eye. `<div class="ad-safe">` spacers sit between
the play area and every ad slot, sized from the `--ad-safe` token in `style.css`.
The measured distances in the live layout are:

| Slot | Distance from the board |
|---|---|
| `ad-rail` (300×600, desktop only) | 296px |
| `ad-article` (in-content) | 1,120px |
| `ad-bottom` (leaderboard) | 354px |

**There is deliberately no ad above the board.** A leaderboard there plus its 150px gap
pushed the game below the fold on a 1080p laptop, which costs more in engagement than the
unit earns. The game is the first thing on screen at every size.

## Going live: `./setup.sh`

Rather than hunting placeholders through five files by hand, run this. It rewrites the
canonical and Open Graph URLs on every page, fills in the contact email and site URL in
the policy pages, deletes the "before you publish" reminder boxes, writes `ads.txt`, adds
the AdSense site-verification meta tag, and flips the production flags in `ads.js`. It is
safe to run repeatedly.

**Step 1 — before you apply.** You need the site live with real URLs and no placeholders:

```bash
./setup.sh --url https://yourdomain.com --email you@example.com
```

**Step 2 — once AdSense approves you** and you have created the three ad units:

```bash
./setup.sh --url https://yourdomain.com --email you@example.com \
           --pub ca-pub-1234567890123456 \
           --slot-rail 1111111111 --slot-article 2222222222 --slot-bottom 3333333333
```

That turns off the dashed placeholders and test mode, and writes your real `ads.txt` line.

**Step 3 — once H5 Games Ads is approved**, to switch rewarded video from the simulated
countdown to real inventory:

```bash
./setup.sh --h5
```

The script prints any placeholder it could not resolve, so a run that ends with
`no placeholders left in any page.` means nothing is waiting on you.

## Pre-submission checklist

Everything structural is already done. What is left is only what needs your real details:

- [ ] Site deployed and reachable over HTTPS
- [ ] `./setup.sh --url ... --email ...` run, reporting no placeholders left
- [ ] Every page opens and the footer Privacy Policy link works
- [ ] `yourdomain.com/ads.txt`, `/robots.txt` and `/sitemap.xml` all load
- [ ] Site submitted to [Google Search Console](https://search.google.com/search-console)
      and the sitemap given to it — not required, but approval is smoother when Google has
      already crawled you
- [ ] Left live for a few days with some real traffic before applying
- [ ] Applied at <https://www.google.com/adsense>
- [ ] After approval: `./setup.sh --pub ... --slot-*` and redeploy
- [ ] For EEA/UK traffic, turn on AdSense → **Privacy & messaging → European
      regulations** (a certified CMP, which the built-in banner is not)
- [ ] Optionally apply for **H5 Games Ads**, then `./setup.sh --h5`

## What gets you approved

The reason most game sites get rejected is "low value content" — a page with a game and
nothing else. This site ships with the fix already in place:

- **Real written content** — a full strategy guide, an about page explaining how it was
  built and funded, and substantial copy on the home page. Not filler.
- **Privacy Policy, Terms, and a footer nav** linking them from every page.
- **A consent banner** with a non-personalised option.
- `ads.txt`, `robots.txt`, `sitemap.xml`, canonical tags, Open Graph tags, and
  `VideoGame` structured data.
- **Original work.** No Tetris trademark anywhere, no copied assets.

Before you submit, replace every `[SQUARE BRACKET]` placeholder in `privacy.html`,
`terms.html` and `about.html` with your real contact email, site URL and host. A policy
still saying `[YOUR CONTACT EMAIL]` will fail review on its own.

## Where the privacy policy lives

`privacy.html`, and it is reachable from:

- the footer of **every** page (AdSense requires it be accessible sitewide),
- the header nav,
- the cookie consent banner,
- **Settings → Privacy Policy** inside the game.

It already covers what a Google review looks for: local storage, the AdSense/DoubleClick
cookie disclosure with Google's required wording, third-party vendor opt-out links, the
rewarded-video disclosure, GDPR rights, CCPA/CPRA, and a children's-privacy section.

**One thing it does not cover:** for EEA, UK and Swiss traffic Google requires a
*certified* Consent Management Platform, which the hand-rolled banner in `ads.js` is not.
Use the free one built into AdSense — **Privacy & messaging → European regulations** —
which overlays this banner and satisfies the requirement.

## Ad formats in use

This site is wired for **H5 Games Ads**, not standard AdSense display units.

| Format | Placement | Opt-in? |
|---|---|---|
| Rewarded video | Second Chance after a game over; power-up refill | **Yes, always.** The reward is granted on a completed view, never on a click. |
| Interstitial | On the transition into a new game, every 3rd game over | No - this is the format's intended use. |

The interstitial is deliberately constrained:

- it fires only on **Play Again after a game over**, never mid-run, and never
  from the in-game Restart button, which is not a natural break;
- it is suppressed if the player already watched a rewarded ad in that game;
- game audio is muted while it plays;
- `adBreak()` is a request, not a guarantee - Google applies its own frequency
  capping on top of the `data-ad-frequency-hint="60s"` on the script tag - so
  the completion path runs whether or not an ad actually showed, and a ten
  second failsafe starts the next game if the SDK never calls back.

Change the rate with `GAMES_PER_AD` in `game.js`.

**Test ads earn nothing.** While `data-adbreak-test="on"` is on the script tag
you are seeing test inventory. Switch it off when you are ready to earn:

```bash
./setup.sh --pub ca-pub-XXXXXXXXXXXXXXXX --h5 --test off
```

The three display slots (rail, in-content, bottom) need standard AdSense
display ad units, which are a separate product. They stay hidden until slot IDs
are configured, so an H5-only account simply does not show them.

## Auto Ads: leave them OFF

Once your publisher ID is in the page head, Google may offer to run **Auto Ads**,
which place units automatically wherever its model thinks they will earn. On a game
site that is actively dangerous: Auto Ads do not know where the play area is, and can
drop an anchor or in-page unit right beside the board, which is exactly the
accidental-click setup the 150px separation exists to prevent.

Keep Auto Ads **off** for this site (AdSense → Ads → Your sites → toggle off) and use
the three manual units. If you do want Auto Ads, exclude the game page and restrict
placements — but the manual units are the safe default here.

## What to actually expect

Casual game traffic monetises at roughly **$0.50–$2.00 per 1,000 pageviews**. A thousand
visits a day is about **$15–60 a month**. Rewarded video pays far better per impression
than display, but only fires when a player opts in, so it scales with engagement rather
than traffic.

Revenue is a traffic problem, not an ad-code problem. Once traffic exists, look at
**Ezoic** (no minimum, typically beats raw AdSense) or **Mediavine/Raptive** (50k+ and
100k+ sessions/month, much higher rates). A **Ko-fi** link converts better than ads on a
small site.

## Naming note

"Tetris" is a registered trademark of The Tetris Company, actively enforced against free
browser games. It appears nowhere in this project's name, title, metadata or copy, and it
should stay that way on a monetised site.

## Licence

MIT.
