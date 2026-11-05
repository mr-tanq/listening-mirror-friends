# Venue-first concert images and discovery

Find each concert on the **venue's own website**, confirm it is the same show, and use the venue's official artwork. The same venue sources also **discover concerts directly**, so the catalogue no longer depends on Podiuminfo alone.

## 1. Why the first pilot found nothing

GitHub Actions run [42038133272](https://github.com/mr-tanq/listening-mirror-friends/actions/runs/42038133272) reported `"attempted": 0`. It never fetched a single event page; about 290 concerts ended as "unmatched" at the agenda-link stage, and Tivoli answered 403. Causes:

| Cause | Evidence |
|---|---|
| Paradiso's configured agenda (`/landing/concertagenda-paradiso/…`) and its homepage list only ~25 events, against ~138 in the catalogue | Probe: 25 event links on the homepage |
| Melkweg serves an AWS WAF browser challenge (HTTP 202, 2.4 kB) for every URL, including `robots.txt` | Probe run [42039094666](https://github.com/mr-tanq/listening-mirror-friends/actions/runs/42039094666) |
| TivoliVredenburg: Cloudflare 403 on agenda and sitemap (its `robots.txt` itself allows crawling) | Probe |
| Link text in agenda HTML is not a reliable title (images, dates, buttons) | Pilot design |
| `titleMatch` required names of 5+ characters, so `MONO`, `Sef`, `Caro` and `Vera`-sized names could never match | Pilot code |
| One wrong assumption per venue failed the whole venue: no sitemap, no structured data, no fallback | Pilot design |

## 2. What each venue officially publishes

Read-only probe of 2026-11-05: robots.txt, sitemaps, agenda HTML, WordPress REST discovery, and one sample event page per venue.

| Venue | Access | Event list | Event page data | Adapter |
|---|---|---|---|---|
| Paradiso | ok | `sitemap.xml` → `sitemap/event_N.xml` (+ homepage) | JSON-LD `Event`: performers, timezone date, location, image. **Some listings are shows Paradiso promotes elsewhere** (e.g. Tolhuistuin) | active |
| 013 | ok | `/programma` (~141 links); events sitemap; `programma.md` | JSON-LD `MusicEvent` with performer + `Event` | active |
| Doornroosje | ok | homepage (~201 links), `events-sitemap.xml` | JSON-LD `Event` + performer. **Local time is labelled `+00:00`**, so the written date is used | active |
| Effenaar | ok (robots: `/archive` disallowed) | `/agenda` (~114 links); no sitemap | JSON-LD `Event` (no performers) | active |
| Patronaat | ok, **crawl-delay 10 s** | `/programma` (~165 links), `pt_event-sitemap*.xml` | No event JSON-LD. **Date is in the URL** (`…-05-11-26/`); title and image from Open Graph | active (max 14 pages/run) |
| Paard | ok | `event-sitemap*.xml` (newest last) | JSON-LD `Event`, floating local time, no location | active |
| Bibelot | ok | `/programma` (30 links), `programma-sitemap.xml` | Open Graph only | experimental: `<time>` date required |
| Vera | ok | `events-sitemap.xml` | Open Graph only (titles may say "locatie De Oosterpoort") | experimental |
| Baroeg | ok | `wp_theatre_event` sitemap | unknown | experimental |
| TivoliVredenburg | **403 (Cloudflare)** | — | — | blocked: ask the venue for a feed |
| Melkweg | **bot challenge (AWS WAF)** | — | — | blocked: ask the venue for a feed |
| dB's (`dbstudio.nl`) | **robots.txt `Disallow: /`** | — | — | excluded |
| Grenswerk | ok | no machine-readable list found | — | research |

**Not found anywhere:** public iCalendar/RSS event feeds, The Events Calendar REST APIs, or documented public event APIs. WordPress REST exists on several sites, but the event post types are not exposed (Bibelot's `programma` is, without dates).

**Access rule:** HTTP 401/403/429 and bot challenges are the venue's decision. The client records the denial and stops for 7 days (1 day for 429). It never changes identity, rotates IPs, uses headless browsers or solves challenges. TivoliVredenburg and Melkweg (together ~330 catalogue concerts) can only be covered with their consent: a feed, an allow-listed User-Agent or partner data.

## 3. Architecture

```
data/events.json (last published) ──┐
                                    ▼
scripts/update-venue-catalog.mjs (runs even if Podiuminfo failed)
  for each venue adapter (in parallel, one polite client per host):
    robots.txt → listing (agenda links / sitemap, past dates dropped)
    → prioritise: URLs whose slug matches a catalogue headliner first,
      then stale cache, then new pages (discovery)
    → fetch event page → parseEventPage (JSON-LD ▸ URL date ▸ <time>)
    → data/venue-events.json (page cache, 7-day refresh, past pruned)
  A. enrichCatalogue: bestOfficialMatch(concert, official events)
       → officialUrl + confidence; image candidate
       → event.image ONLY if policy imageUse = "permitted" and no image yet
  B. discoverFromVenues: official concerts not in the catalogue
       → new events (source "venue-official") if policy discovery = true
  writes data/events.json, data/venue-events.json, data/venue-image-candidates.json
```

| File | Role |
|---|---|
| `scripts/venue-sources/core.mjs` | robots.txt, polite client, denial memory, JSON-LD/OG/sitemap/iCal extraction, Amsterdam dates |
| `scripts/venue-sources/adapters.mjs` | per-venue technique (listing URLs, URL shapes, date quirks, budgets) |
| `scripts/venue-sources/parse.mjs` | page → official event |
| `scripts/venue-sources/match.mjs` | confidence matching |
| `scripts/venue-sources/pipeline.mjs` | refresh, enrichment, discovery |
| `scripts/update-venue-catalog.mjs` | CLI stage (`--audit` = read-only report) |
| `data/nl-venue-sources.json` | **policy**: discovery switch, image permission and evidence, access findings |

**Adding a venue:**
1. Run `node scripts/probe-venue-sources.mjs <id>` (add its URL to `PROBE_VENUES`) via the probe workflow.
2. Add an adapter.
3. Add a fixture test from a real page.
4. Add a policy entry.

## 4. Matching (`match.mjs`)

**Hard requirements.** All must hold, or there is no match:
- **Same calendar date.** Dates come from timezone-aware Amsterdam conversion, the written date for venues that mislabel local time, or the official URL date.
- **Venue identity.** The catalogue venue is one of the adapter's aliases, **and** the official location, when published, is on-site. A Paradiso-promoted show at Tolhuistuin never matches "Paradiso".
- **Not cancelled or postponed.**
- **Headliner identity.** The catalogue headliner (incl. derived names such as `Caro - Returning to Innocence` → `Caro`) must exactly equal the official headliner: first performer, or the headliner derived from the official title (`O.R.k. + Hackberry` → `O.R.k.`). A catalogue headliner that appears **only as a support act** is rejected. Tour names, series prefixes (`Reggae Central:`) and guest separators are handled by the shared `headlinerNames()`.

**Confidence.** 0.3 for date + venue, plus 0.6 for the headliner, plus 0.1 when support acts also agree. The threshold is 0.85, so the headliner is mandatory. Two different official pages matching the same concert are **ambiguous** and rejected. There is no fuzzy similarity anywhere.

**Show identity for discovery and reconciliation (`showIdentity`).** Every catalogue concert is compared with an official event and gets one of three verdicts:

| Verdict | When | Discovery | Daily reconciliation |
|---|---|---|---|
| `same` | Same official URL, **or** strict identity (date + on-site venue + exact headliner) | Not added | Venue copy removed |
| `possible` | Same night and venue, and either one full headliner name extends the other at a word boundary (`De Jukebox` / `De Jukebox #17`), or a complete multi-word name appears as a phrase in the other title (`Funk Legacy Allstars` / `Candy Dulfer Presents FUNK LEGACY ALLSTARS featuring …`) | Not added; listed for review | **Kept**: ambiguous cases are never deleted |
| `different` | Anything else | Added | Kept |

Sharing a single word is never evidence of the same show: `Black Midi` and `Black Country, New Road` on the same night are two concerts.

**Guards against tiny or generic names.**
- Matching is on whole words only.
- Generic words (`the`, `de`, `band`, `presents`, `featuring`, `live`, …) don't count.
- A prefix match needs a distinctive shorter name: two meaningful words, or one of 6+ letters (`jukebox`). So `Black` is not a possible duplicate of `Black Midi`, and `The Who` is not one of `The Who Tribute Night`.
- A phrase inside a longer title needs two or more meaningful words (`Funk Legacy Allstars`).

**Removing a discovered concert needs positive evidence from its own official page:**
- the page says cancelled or postponed;
- the page now shows another date (the new date is discovered as a new event);
- the page answers 404/410 on two checks on different days.

Absence from an agenda or sitemap is never evidence, because listings are often partial (homepages, paginated agendas, the newest sitemap pages only). Pages that leave a listing are re-checked weekly instead. Denied access and network failures change nothing.

Discovery being switched off for a venue (policy) also removes that venue's discoveries.

## 5. Image priority and permission

The card priority is unchanged and implemented in `resolveConcertImage()`:
1. **Official image for the exact concert** (`event.image`, `imageSource: venue-official`, credit "Image: <venue>" linking the official page).
2. Verified Deezer artist photo.
3. Licensed Wikimedia Commons photo.
4. Typographic card.

Existing event images are never replaced.

**Recording an image URL is not permission to show it.** Every venue starts at `imageUse: "pending"`: matches are stored in `data/venue-image-candidates.json` but not published. To publish a venue's artwork:
1. Get written permission (e-mail template below), or confirm that the venue's published terms allow it.
2. Set `"imageUse": "permitted"` and record who, when and the scope in `"imageUseEvidence"`.

The next run publishes the matched images. `"denied"` stops candidates entirely.

Suggested request (Dutch venues are usually happy to be promoted):

> Subject: Promoting your concerts in a free concert-discovery app
>
> We run Listening Mirror, a free, non-commercial app that helps fans discover concerts in the Netherlands. We list your shows with a link to your official event page for tickets. May we display the official promotional image from your event pages (as published, unaltered, credited "Image: <venue>" and linked to your page)? If you prefer, a feed or an allow-listed user agent works for us too. Our crawler identifies itself as `ListeningMirrorFriends/1.2 (+https://github.com/mr-tanq/listening-mirror-friends)`, respects robots.txt and fetches at most one page every 1.5 s.

**Discovery** publishes facts (artist, date, venue) plus a link to the official page, only for venues whose robots.txt allows it and whose dates are machine-readable. `termsReviewed` is `false` for every venue until someone has read the venue's terms. Turn `discovery` off for any venue that objects.

## 6. Independence from Podiuminfo

`update-events.yml` now runs the venue stage **after** the Podiuminfo-based step, **even if that step failed**. It starts from the last published `events.json`, drops past concerts, adds venue-discovered concerts and re-matches official pages. The commit step also runs after a failure, so the feed keeps moving.

Venue discovery covers the active adapters only: Paradiso, 013, Doornroosje, Effenaar, Patronaat and Paard (~450 catalogue concerts today). Podiuminfo still covers the other ~80 Dutch venues. TivoliVredenburg and Melkweg need venue consent.

## 7. Measured results (live read-only audits, 2026-11-05)

Five audit runs on GitHub Actions against the real venue sites (final run [42043832663](https://github.com/mr-tanq/listening-mirror-friends/actions/runs/42043832663)):
[42040425586](https://github.com/mr-tanq/listening-mirror-friends/actions/runs/42040425586), [42041164480](https://github.com/mr-tanq/listening-mirror-friends/actions/runs/42041164480), [42042093191](https://github.com/mr-tanq/listening-mirror-friends/actions/runs/42042093191), [42043016450](https://github.com/mr-tanq/listening-mirror-friends/actions/runs/42043016450).

Every audit starts with an empty cache and limited page budgets. The daily job keeps its cache, so coverage grows run over run.

| Venue | Catalogue concerts | Official match (best run) | Notes |
|---|---:|---:|---|
| Paradiso | 138 | 74 | 110 of 325 listed pages in one run; the remainder are later dates |
| 013 | 51 | 46 | 26 extra official concerts discovered |
| Doornroosje | 69 | 63 | |
| Effenaar | 41 | 31 | Needed room names as on-site locations |
| Paard | 74 | 42 | Needed room names, `&eacute;` decoding and `/en/` URL folding |
| Patronaat | 79 | 12 | Crawl-delay 10 s, so 14 pages per run; full coverage after about 6 daily runs |
| Bibelot | 35 | 19 | First dated text (enrichment only) |
| Vera | 43 | 0 | No machine-readable date yet |
| Tivoli / Melkweg / dB's | 358 | 0 | Blocked or excluded by the venue |
| **Total** | | **287** (pilot: 0) | **61 new concerts** discovered |

**Fixes made from the audits:**
- Room names (`Kleine Zaal`, `GR8`, `Café Wilhelmina`) count as on-site locations.
- Named HTML entities are decoded.
- An Effenaar "image" that was the page URL itself is rejected.
- Language duplicates of one Paard event collapse into one event.
- Spacing-only name variants match (`Witchfingers` / `Witch Fingers`).
- A single network timeout no longer ends a venue's run.

**Correctly refused, as designed:**
- `Knoll` billed as support of `Imperial Triumphant`.
- Off-site Paradiso shows (Tolhuistuin, Bitterzoet).
- Off-site 013 shows (Hall of Fame, Little Devil).
- Cancelled shows (`Afgelast:` / `EventCancelled`).
- Name variants that add words (`Eddie Jobson U.K. Revisited` vs `Eddie Jobson`).

**Rate sensitivity:** after seven audit runs on one day (about 90 pages each), 013 started answering with a Cloudflare challenge. The client detected it and backed off for 7 days, as designed. Production runs once a day and refetches pages only weekly. Spacing is now 2.5 s per host, and the audit/probe workflows run only manually or on `main`.

## 8. Limits

- First runs fetch at most 14–70 pages per venue. Full coverage builds over a few daily runs; pages are re-checked weekly.
- Effenaar pages carry no performers, so only title-derived headliners match. Patronaat, Bibelot and Vera have no JSON-LD event, so title + URL/`<time>` date are used. Bibelot, Vera and Baroeg stay experimental (discovery off) until audits show clean results.
- The cache file grows to roughly 1–2 kB per upcoming official event (~1 MB at most).
