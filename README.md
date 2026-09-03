# 2048 Drop

A falling-block puzzle game that crosses the classic Russian-style block drop with the
merge maths of 2048. Numbered blocks fall down a five-column well; land one beside a
matching number and they fuse into double the value. Merges collapse the stack, which
can trigger chain reactions worth bonus points.

**Zero dependencies.** One `index.html` file — no build step, no npm, no framework.

## Play

Open `index.html` in a browser. That's it.

| Input | Action |
|---|---|
| `←` `→` | Move the falling block |
| `↓` | Soft drop (+1 point per row) |
| `↑` / `Space` | Hard drop (+2 points per row) |
| `P` | Pause |
| `R` | Restart |
| Swipe / tap | Mobile controls |

## Rules

- A block spawns at the top of the middle column and falls one row at a time.
- On landing, any two orthogonally adjacent blocks with the same number merge into one
  block of double the value. The lower block survives on a vertical match, the left
  block on a horizontal one.
- Merges leave gaps, gravity pulls everything down, and new matches can form — that is a
  chain. Chain link *n* scores the merged value × *n*.
- Speed increases one level per 1,500 points.
- The game ends when the spawn cell is blocked.

Best score is kept in `localStorage`, on the player's own device only. No accounts, no
tracking, no server.

## Hosting on GitHub Pages

```bash
gh repo create 2048-drop --public --source=. --remote=origin --push
```

Then in the repo: **Settings → Pages → Source: Deploy from a branch → `main` / `root` → Save.**

The site goes live at `https://<your-username>.github.io/2048-drop/` in about a minute.

After it's live, update these to the real URL (they currently say `example.github.io`):

- the `<link rel="canonical">` tag in `index.html`
- the two `og:url` / `og:*` meta tags

### Custom domain (optional, recommended before applying to AdSense)

1. Buy a domain (~$10/yr).
2. Add a file named `CNAME` at the repo root containing just the domain.
3. At your registrar, point the apex `A` records at GitHub's IPs
   (`185.199.108.153`, `.109.153`, `.110.153`, `.111.153`) and `www` `CNAME` to
   `<your-username>.github.io`.
4. Settings → Pages → Custom domain → enter it → tick **Enforce HTTPS**.

## Ads

The page has three ad slots wired up: a top leaderboard, a 300×250 sidebar (hidden below
900px), and a bottom unit. They are deliberately placed **outside** the play area —
AdSense will suspend an account for ads a player can click by accident while gaming.

Until configured, the slots render as dashed placeholders so you can see the layout.

### Turning them on

1. Apply at <https://www.google.com/adsense>. You need a live site with real content
   before they'll approve you — deploy to Pages first, ideally on a custom domain, and
   let it sit for a few days.
2. Once approved, create three ad units in the AdSense dashboard.
3. Edit the `ADS` block near the top of the `<script>` in `index.html`:

```js
const ADS = {
  client: 'ca-pub-1234567890123456',   // your publisher ID
  slots: {
    top:    '1234567890',
    side:   '2345678901',
    bottom: '3456789012'
  },
  showPlaceholders: true
};
```

4. Replace the placeholder line in `ads.txt` with the one AdSense gives you, using your
   own publisher ID. Google will warn you in the dashboard if this file is missing or
   wrong.

### Realistic expectations

Casual game traffic monetises at roughly **$0.50–$2.00 per 1,000 pageviews**. A thousand
visits a day is somewhere near $15–60 a month. Revenue follows traffic, so the work that
actually pays is getting people to the page — the ad code is the easy part.

Alternatives worth knowing about, once you have traffic: **Ezoic** (no traffic minimum,
higher yield than raw AdSense), **Adsterra** or **PropellerAds** (approve almost anyone,
but lower quality ads). Also consider adding a Ko-fi or Buy Me a Coffee link, which
converts far better than ads on small sites.

## Naming note

The word "Tetris" is a registered trademark of The Tetris Company and is actively
enforced, including against free browser games. It is deliberately absent from this
project's name, title, description, and metadata. Keep it that way, especially on a
monetised site.

## Licence

MIT. Do what you like with it.
