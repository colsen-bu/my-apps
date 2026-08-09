#!/usr/bin/env python3
"""
fetch_riot_cards.py — pull the Riftbound card list straight from Riot.

Riot's card gallery is a Next.js app, so its data sits at
    /_next/data/{BUILD_ID}/en-us/card-gallery.json
The build id changes on every deploy, so it's read off the gallery page first.
No API key, no account, nothing to sign up for.

Browsers can't do this themselves: Riot sends no CORS header on that endpoint,
so a page on any other origin is refused. A script has no such restriction.

    python3 fetch_riot_cards.py

Writes riftbound-cards.json next to itself. Open RiftDeck, tap the status text,
choose "Open a card file…", and pick that file. Or just drag it onto the page.

Options:
    -o, --output PATH   where to write        (default riftbound-cards.json)
    --images DIR        also download card art (optional, ~660MB for everything)
    --limit N           stop after N cards    (handy for a quick test)
    --raw PATH          dump Riot's untouched payload, for debugging
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ORIGINS = [
    "https://playriftbound.com",
    "https://riftbound.leagueoflegends.com",
]
GALLERY_PATH = "/en-us/card-gallery"
UA = "Mozilla/5.0 (compatible; RiftDeck card fetcher)"
TIMEOUT = 30


def get(url, binary=False):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "*/*" if binary else "text/html,application/json,*/*",
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        raw = r.read()
    return raw if binary else raw.decode("utf-8", "replace")


def find_build_id(html):
    for pattern in (r'"buildId"\s*:\s*"([^"]+)"', r'/_next/static/([^/"]+)/_buildManifest'):
        m = re.search(pattern, html)
        if m:
            return m.group(1)
    return None


def find_card_array(node, depth=0):
    """The card list is nested and its exact path shifts between deploys,
    so look for the first array whose members look like gallery cards."""
    if depth > 10 or node is None:
        return None
    if isinstance(node, list):
        if len(node) > 20 and all(
            isinstance(x, dict) and isinstance(x.get("name"), str)
            and isinstance(x.get("id") or x.get("cardCode") or x.get("slug"), str)
            for x in node
        ):
            return node
        for child in node:
            hit = find_card_array(child, depth + 1)
            if hit:
                return hit
        return None
    if isinstance(node, dict):
        for value in node.values():
            hit = find_card_array(value, depth + 1)
            if hit:
                return hit
    return None


def flatten(v):
    """Riot wraps many fields as {'value': {'id','name'}} or {'name': ...}."""
    if v is None:
        return ""
    if isinstance(v, (str, int, float)):
        return str(v)
    if isinstance(v, list):
        return ", ".join(x for x in (flatten(i) for i in v) if x)
    if isinstance(v, dict):
        for key in ("value", "name", "label", "id"):
            if key in v:
                return flatten(v[key])
    return ""


def first(v):
    return flatten(v[0]) if isinstance(v, list) and v else flatten(v)


def unwrap(field):
    """Riot wraps every display field as {'label': <heading>, <payload key>: …}.

    The heading is UI chrome ("Domain", "Card Type"), so reaching for it blindly
    yields the column name instead of the card's value. Take the payload."""
    if isinstance(field, dict):
        for key in ("value", "values", "type", "tags", "richText"):
            if key in field:
                return field[key]
    return field


def ident(field):
    """The stable machine id of a wrapped field — 'UNL', 'unit', 2 — not its label."""
    v = unwrap(field)
    if isinstance(v, list):
        v = v[0] if v else None
    return v.get("id") if isinstance(v, dict) else v


TAG_RE = re.compile(r"<[^>]+>")
ENTITIES = {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
            "&#39;": "'", "&nbsp;": " "}


def strip_html(html):
    if not html:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", str(html), flags=re.I)
    text = re.sub(r"</p>\s*<p>", "\n", text, flags=re.I)
    text = TAG_RE.sub("", text)
    for k, v in ENTITIES.items():
        text = text.replace(k, v)
    return text.strip()


def rules_text(card):
    """Ability text, plus the trailing effect gear/attachments carry separately."""
    parts = [strip_html(flatten_rich(card.get(k))) for k in ("text", "effect")]
    return "\n".join(p for p in parts if p)


def flatten_rich(field):
    if isinstance(field, dict):
        rich = field.get("richText")
        if isinstance(rich, dict):
            return rich.get("body") or ""
    return field if isinstance(field, str) else ""


def convert(card):
    """Riot's record -> the shape RiftDeck reads."""
    cid = str(card.get("id") or card.get("cardCode") or card.get("slug") or "")

    num = card.get("collectorNumber")
    if not isinstance(num, int):
        try:
            num = int(flatten(card.get("collector_number") or card.get("number")))
        except (TypeError, ValueError):
            num = None

    # publicCode ("OGN-001/298") already carries the zero padding and the 019a /
    # -star oddities that RiftDeck's collector-number regex expects.
    public = str(card.get("publicCode") or "")
    number = public.split("-", 1)[1].replace("/", "-") if "-" in public else ""
    if not number:
        m = re.search(r"-(\d+)$", cid)
        number = f"{num}-{m.group(1)}" if isinstance(num, int) and m else cid

    image = card.get("cardImage") or card.get("image") or {}
    image = image.get("url", "") if isinstance(image, dict) else flatten(image)

    out = {
        "cardCode": cid,
        "name": card.get("name", ""),
        "fullName": card.get("name", ""),
        "setCode": str(ident(card.get("set") or card.get("setId")) or "").lower(),
        "cardSet": first(unwrap(card.get("set"))) or flatten(card.get("setName")),
        "cardNumber": number,
        "rarity": first(unwrap(card.get("rarity"))),
        # A card may list two domains; RiftDeck's filters key off a single string.
        "domain": first(unwrap(card.get("domain") or card.get("domains"))) or "Colorless",
        # Tokens leave `type` empty and carry "Token" in superType instead.
        "cardType": (first(unwrap(card.get("cardType") or card.get("type")))
                     or first((card.get("cardType") or {}).get("superType"))),
        "abilityEffective": rules_text(card),
        "artist": flatten(unwrap(card.get("illustrator") or card.get("artist"))),
        "imageUrl": image.split("?")[0],
    }
    if isinstance(num, int):
        out["collectorNumber"] = num
    tags = unwrap(card.get("tags"))
    if isinstance(tags, list):
        cleaned = [t for t in (flatten(t) for t in tags) if t]
        if cleaned:
            out["tags"] = cleaned
    for key in ("energy", "might", "power"):
        val = ident(card.get(key))
        if isinstance(val, (int, float)):
            out[key] = val
    return out


def fetch_cards(raw_path=None):
    errors = []
    for origin in ORIGINS:
        try:
            print(f"  reading {origin}{GALLERY_PATH} …")
            html = get(origin + GALLERY_PATH)
            build = find_build_id(html)
            if not build:
                raise RuntimeError("no build id on the gallery page")
            print(f"  build id {build}")

            url = f"{origin}/_next/data/{build}{GALLERY_PATH}.json"
            print("  downloading card gallery …")
            payload = json.loads(get(url))

            if raw_path:
                with open(raw_path, "w", encoding="utf-8") as f:
                    json.dump(payload, f, indent=2, ensure_ascii=False)
                print(f"  raw payload -> {raw_path}")

            rows = find_card_array(payload)
            if not rows:
                raise RuntimeError("no card list inside the payload")
            print(f"  found {len(rows)} records")
            return rows
        except Exception as exc:                      # noqa: BLE001
            errors.append(f"{origin}: {exc}")
            print(f"  ! {exc}")
    raise SystemExit("\nCouldn't reach Riot's gallery.\n  " + "\n  ".join(errors))


def download_images(cards, out_dir, limit=None):
    os.makedirs(out_dir, exist_ok=True)
    todo = [c for c in cards if c.get("imageUrl")][:limit]
    print(f"\nDownloading {len(todo)} images to {out_dir}/ …")
    done = skipped = failed = 0
    for i, card in enumerate(todo, 1):
        dest = os.path.join(out_dir, f"{card['cardCode']}.png")
        if os.path.exists(dest):
            skipped += 1
            continue
        try:
            with open(dest, "wb") as f:
                f.write(get(card["imageUrl"], binary=True))
            done += 1
        except Exception:                             # noqa: BLE001
            failed += 1
        if i % 25 == 0 or i == len(todo):
            print(f"  {i}/{len(todo)}  saved {done}, skipped {skipped}, failed {failed}")
        time.sleep(0.05)                              # be gentle with Riot's CDN
    print(f"Images: {done} new, {skipped} already there, {failed} failed")


def main():
    ap = argparse.ArgumentParser(description="Fetch Riftbound cards from Riot")
    ap.add_argument("-o", "--output", default="riftbound-cards.json")
    ap.add_argument("--images", metavar="DIR", help="also download card art")
    ap.add_argument("--limit", type=int, help="stop after N cards")
    ap.add_argument("--raw", metavar="PATH", help="dump Riot's untouched payload")
    args = ap.parse_args()

    print("Fetching Riftbound cards from Riot\n")
    rows = fetch_cards(args.raw)

    cards, seen = [], set()
    for row in rows:
        card = convert(row)
        if not card["cardCode"] or card["cardCode"] in seen:
            continue
        seen.add(card["cardCode"])
        cards.append(card)
    cards.sort(key=lambda c: (c.get("setCode", ""), c.get("collectorNumber") or 9999, c["name"]))
    if args.limit:
        cards = cards[:args.limit]

    if not cards:
        raise SystemExit("Parsed the payload but found no usable cards.")

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(cards, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(args.output) / 1024
    print(f"\nWrote {len(cards)} cards to {args.output}  ({size_kb:.0f} KB)")

    by_set = {}
    for c in cards:
        by_set[c.get("cardSet") or c.get("setCode") or "?"] = by_set.get(
            c.get("cardSet") or c.get("setCode") or "?", 0) + 1
    for name, count in sorted(by_set.items(), key=lambda kv: -kv[1]):
        print(f"  {count:>5}  {name}")

    missing = sum(1 for c in cards if not c.get("imageUrl"))
    if missing:
        print(f"\n  note: {missing} cards came through without an image URL")

    if args.images:
        download_images(cards, args.images, args.limit)

    print(f"\nNow open RiftDeck and drag {args.output} onto the page.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("\nStopped.")
