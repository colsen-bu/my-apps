# Riftbound Collection

A phone-first collection tracker for the Riftbound TCG. All 1,180 cards come
straight from Riot's own card gallery; what you own lives in your browser and
exports to JSON whenever you want it.

Built as a static site — Vite, React, TypeScript — with a service worker, so it
installs to the iPhone home screen and works with no signal.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173, also served on your LAN IP
npm run build      # static site in dist/
npm run preview    # serve the built site
```

`npm run dev` binds to all interfaces, so the phone can open
`http://<your-mac>.local:5173` over the same Wi-Fi.

### On the iPhone

Deploy `dist/` anywhere static — GitHub Pages, Netlify, a folder on any host.
The build uses relative asset paths, so a subdirectory is fine. Open it in
Safari, then **Share → Add to Home Screen**. From then on it launches full
screen, and the cards, layout, and any art you have already looked at are
available offline.

## Adding cards

Three ways in, depending on what is in front of you:

- **Quick add** — pick a set and punch in collector numbers on the keypad. At a
  full-width number the card is added and the display clears, so a physical
  stack goes in as fast as you can read it. Recent additions stay listed with an
  Undo next to each.
- **Cards → Tap: +1** — flip the tap mode and every tile in the grid becomes a
  one-tap increment. Good for filling in a set you are looking at.
- **List view** — the ▦/☰ toggle switches to rows with a −/+ stepper each.

Foils are counted separately from regular copies everywhere.

A card's number is not unique inside a set: Origins prints both `007` and the
Showcase `007a`, and tokens, runes, and special cards run their own `T`/`R`/`SP`
numbering. Quick add shows the letter runs as separate keypads, and when a
number has more than one printing it asks which one you meant.

## Exporting

**Data** tab. Four formats:

| Format | What it is |
| --- | --- |
| JSON | Every owned card with its full Riot record and quantities |
| JSON (compact) | `cardCode → {n, f}` only; small, and re-imports here |
| CSV | One row per card, for Numbers or Excel |
| Text list | `2x Card Name — Origins 001` lines |

**Share** opens the iOS share sheet (AirDrop, Files, Messages); **Save file**
downloads; **Copy** puts it on the clipboard. Import takes any of the JSON
shapes back — including the flat `{code: count}` map the old single-file version
wrote — and can replace, add to, or take the max of your current counts.

## Refreshing the card data

Riot's gallery is a Next.js app with no CORS header, so the browser cannot read
it directly. The fetcher does it instead:

```bash
npm run cards      # rewrites public/cards.json
```

Then rebuild and redeploy. The script re-derives Riot's build id on each run, so
it keeps working across their deploys.

## Layout

```
public/cards.json          all cards, fetched from Riot, loaded at startup
scripts/fetch_riot_cards.py  the fetcher
scripts/make-icons.mjs     regenerates the PWA icons (npm run icons)
src/lib/cards.ts           loading, facets, search index, filtering, sorting
src/lib/collection.ts      the collection store, backed by localStorage
src/lib/printed.ts         printed-number parsing and the per-set number index
src/lib/exporter.ts        export formats, share sheet, download
src/lib/stats.ts           completion by set, domain, rarity
src/views/                 one file per tab
src/components/            tiles, rows, sheet, filters, stepper
```

`legacy-single-file.html` is the original one-file version, kept for reference.

## Where your collection lives

`localStorage`, on the device, under `riftbound.collection.v1`. Nothing is sent
anywhere — there is no account and no server. Clearing Safari's website data
clears the collection too, so export a copy now and then.
