# Artist photo coverage: review and architecture

*Review of the image pipeline as of `main` @ 7e3bba9 (5 Nov 2026), and the changes on this branch.*

## TL;DR

- **Most missing photos were caused by the pipeline, not by Deezer.** Three defects explain most of the gap:
  1. **Throughput.** The Deezer step was capped at 70 requests per day. **1,122 of the 1,150 candidate names had never been looked up.**
  2. **A backoff bug that starved the queue.** `addPodiuminfoArtists()` returned `{version, artists}` and dropped the `attempted` map. Every run therefore re-tried the same top ~70 names, so the queue never advanced.
  3. **Event titles used as artist names.** About 300 of the events without images have titles such as `Caro - Returning to Innocence`, `Tales From The Punx: Wolfbrigade` or `Extince - 30 JAAR SPRAAKWATER`. Exact matching on the full title can never succeed.
- **Deezer stays the primary portrait source.** It has the best visual quality per request. It now sits inside a **multi-provider pipeline with MusicBrainz as the identity hub**:
  - Wikimedia Commons supplies licensed photos.
  - Deezer ids linked by MusicBrainz editors resolve same-named bands that the exact-name rule has to skip.
- **Spotify is not a viable source** (see §2).
- **The biggest remaining gain is event images from official venue pages.** That is phase 2 of the roadmap.

### Coverage today (measured from `data/events.json`, 1,649 upcoming events)

| | Events |
|---|---:|
| Event poster | 380 |
| Cached artist photo (old exact-title rule) | 255 |
| Same cache, new headliner-name resolution (no new lookups) | 268 |
| No image | 1,001 |
| Distinct headliner names now queued for lookup | 1,051 |

**What we can and can't say about the effect:**
- The single Deezer run in the history found **42 of 70** (60%). That sample was the most-played names, so the long tail will match less often.
- **I could not measure live hit rates here.** This environment blocks outbound access to the provider APIs.
- After the first full backlog pass (about 3–4 daily runs), read the real numbers in `data/source-audit.json` (`artistPhotoCache.deezer` / `identity`).

---

## 1. Critical evaluation of the current pipeline

**What was right:**
- Posters first.
- URL-only storage (no re-hosting).
- An exact-name, single-id rule that prefers no image to a wrong image.
- Strict host and path allow-lists in `verifiedArtistPhoto()`.
- A typographic fallback.

**What was wrong or weak:**

| Problem | Effect | Status |
|---|---|---|
| 70 lookups/day, with 180 ms sleeps, against a documented limit of about 50 requests / 5 s | Backlog of 1,122 names, about 16 days to clear even without the bug | **Fixed:** sliding-window limiter at 40/5 s, budget of 450 requests per run |
| `attempted` map dropped between steps | The same failing names were re-queried daily | **Fixed** |
| Lookup key = raw event title | About 300 events can never match | **Fixed:** `headlinerNames()` derives headliner names, conservatively |
| Deezer quota errors arrive as HTTP 200 with `error.code 4/700` and were treated as hard errors | Three such errors stopped the run | **Fixed:** wait and retry once |
| "Exact name + one id on Deezer" taken as identity | **This is uniqueness on Deezer, not identity.** A local band named `Distant` can still get the one Deezer artist called Distant | **Partly fixed:** same-name cases go to MusicBrainz context scoring. Unique-but-wrong cases need the review file (§6) and the cross-check (roadmap phase 3) |
| Distributor uploads sometimes put an album cover in Deezer's artist slot | Album covers shown as band photos | **Fixed for exact copies:** rejected when the portrait's md5 equals one of the artist's album cover md5s (one extra request per hit) |
| No human correction path | Wrong photos stay forever | **Fixed:** `data/artist-image-overrides.json` (block / pin) |
| No attribution on cards | Needed for any CC-licensed source | **Fixed:** credit line on deck, detail and grid cards |

---

## 2. Image sources ranked by practicality × coverage

Terms were checked in this review where they could be reached; anything not verified is marked.

1. **Deezer public API (existing, now improved)**
   - **Coverage:** very high for anyone with distributed releases, including small metal, post-rock and Greek acts with digital releases. Uniform 1000×1000 portraits.
   - **Limits:** about 50 requests / 5 s per IP, per client libraries and third-party docs ([pleezer](https://docs.rs/crate/pleezer/latest/source/src/http.rs), [Rocksky](https://tangled.org/rocksky.app/rocksky/tree/main/deezer)). Deezer's own page was not found.
   - **Terms:** Deezer's developer FAQ says images *"are not allowed to be stored for legal reasons"* and that apps are not certified for commercial use without an agreement ([Deezer FAQ](https://support.deezer.com/hc/en-gb/articles/360011538897-Deezer-FAQs-For-Developers)). → **Keep hot-linking (we store URLs, not files).** Treat Deezer as acceptable for this free, non-commercial app, and as **a liability for a commercial launch** (§9).
2. **Official venue / organiser event pages (`og:image`): not built yet, roadmap phase 2**
   - **Coverage:** the only realistic source for very small local acts. NL venues (Paradiso, Melkweg, TivoliVredenburg, 013, Effenaar, Doornroosje, Patronaat, Paard, Vera, Baroeg, dB's, Bibelot, Grenswerk) publish an image for almost every show.
   - **Fit:** these are event images, so they belong in `event.image` and correctly outrank artist photos.
   - **Existing code:** `scripts/venue-posters.mjs` already does this for Greek venues, with per-domain allow-lists.
   - **Legal position:** promotional material published for promotion. Hot-link, link back, honour robots.txt and take-down requests. There is no explicit licence.
3. **MusicBrainz → Wikidata P18 → Wikimedia Commons (built on this branch)**
   - **Licence:** clean and explicit (CC0 / PD / CC BY / CC BY-SA only, checked per file through `extmetadata`).
   - **Coverage:** good for established acts and for Greek and Dutch acts with Wikipedia articles; poor for the obscure long tail.
   - **Quality:** often live shots in landscape format. They can be darker and less "portrait-like" than Deezer.
   - **Limits:** MusicBrainz ≤ 1 request/s with an identifying User-Agent ([MusicBrainz rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)). Wikimedia enforces its User-Agent policy and, since 2026, throttles non-standard thumbnail widths ([API etiquette](https://www.mediawiki.org/wiki/API:Etiquette/cs), [InstantCommons notes](https://www.mediawiki.org/wiki/Instant_Commons)). We request a standard 960px thumbnail serially.
   - **Main value beyond photos:** an **MBID**, plus links to Deezer, Spotify, Bandcamp and homepages that disambiguate everything else.
4. **Podiuminfo artist images (existing)**
   - Real band photos for NL listings, but the path (`/img/artist/100/…`) suggests about 100px thumbnails, too small for a full-bleed deck card.
   - **Worth checking:** whether a larger rendition exists on the same path scheme. I couldn't test it from here.
5. **TheAudioDB / fanart.tv, via MBID (optional, needs keys)**
   - **Access:**
     - TheAudioDB: free shared key `123` at 30 req/min with reduced results; about $8/month (Patreon) for a personal key at 100 req/min ([summary](https://whatsnowplaying.github.io/whats-now-playing/dev/extras/theaudiodb/)).
     - fanart.tv: requires a project key and looks artists up **only by MBID** ([fanart.tv keys](https://medium.com/fanart-tv/what-are-fanart-tv-personal-api-keys-472f60222856)).
   - **Licensing:** both are community-uploaded and the photo copyright is not cleared. Their good `artistthumb` images are mostly for well-known acts already covered by Deezer.
   - Low marginal value; add only if measured gaps justify it.

### Rejected or not recommended

- **Spotify Web API.**
  - Since February 2026, Development Mode requires the owner to have Premium and caps apps at five users. Extended quota historically required a registered business and 250k MAU ([TechCrunch](https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/), [rspotify issue](https://github.com/ramsayleung/rspotify/issues/550)).
  - The branding guidelines require Spotify attribution and links, and forbid cropping or overlaying artwork ([Spotify design guidelines](https://developer.spotify.com/documentation/design)). Our cards crop with `object-fit: cover` and overlay text.
  - I could not reach `developer.spotify.com` from here to check whether client-credentials artist search still works in Development Mode. Even if it does, the branding rules and quota risk make it unsuitable as a backbone.
- **Last.fm.** Artist images were removed from the API in 2019; it returns a placeholder star ([report](https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/55978243/last-fm-api-returns-same-white-star-image-for-all-artists)).
- **Bandcamp, Instagram, Facebook.** No public image API. Scraping conflicts with their terms.
- **Discogs.** Image access requires authentication, and its terms weren't verified for this use. Not recommended without review.
- **Cover Art Archive.** Album covers only, which is exactly what we don't want as band photos. It's useful only as a fallback *poster* style, and we already have the typographic card.

---

## 3. Architecture

```
events.json ──► headlinerNames()  (shared by browser + job; never support acts)
                  │
   ┌──────────────┴──────────────────────────────────────────────────────────┐
   │ scheduled job (GitHub Actions, daily)                                   │
   │                                                                         │
   │ 0  overrides (block/pin)  data/artist-image-overrides.json              │
   │ 1  Podiuminfo artist thumbnails (existing)                              │
   │ 2  Deezer search  ── exact name ∧ single id ∧ not an album cover ──► ✔  │
   │       └─ ambiguous / none ──► attempted{reason, deezerCandidates}       │
   │ 3  MusicBrainz identity (1 req/s) ─ scored with country + genre        │
   │       ├─ url-rels → Wikidata P18 → Commons (licence allow-list) ──► ✔   │
   │       └─ url-rels → Deezer id (editor-linked) → portrait ──────────► ✔  │
   │ 4  overrides re-applied                                                 │
   │                                                                         │
   │ writes: data/artist-images.json  (URL + source + credit + ids)          │
   │         data/artist-identities.json (MBID, QID, Deezer/Spotify ids…)   │
   └─────────────────────────────────────────────────────────────────────────┘
                  │
browser: resolveConcertImage(event) = event poster ▸ headliner photo (+credit) ▸ typographic card
```

**Design rules:**
- **Precision over recall.** No image is always better than the wrong band.
- **Event poster beats artist photo** (unchanged).
- **One resolver everywhere.** The job looks up exactly the names the browser resolves.
- **Only URLs in git.** No image files: Deezer forbids storage, and image files would bloat the repo.
- **Every automatic stage is bounded** (budget, time, consecutive failures) **and resumable** (per-name `retryAfter`).

---

## 4. Identity matching and disambiguation

1. **Normalise:** NFKD, strip diacritics, lowercase, collapse punctuation (`artistKey`). Greek is preserved as Unicode letters.
2. **Derive the headliner** (`headlinerNames`). The source name always comes first. Conservative derivations follow:
   - `Act - Tour/Title` → Act
   - `Series: Act` → Act, only when the prefix looks like a series: *presents, night, tribute, sessions, café, Nieuwe Oogst…*
   - `Act: Album` → Act
   - Quoted album titles are stripped.
   - `(NL)`, `(live)`, `+ support` are stripped.
   - `Act met/with/feat. Guest` → Act
   - Three or more comma-separated acts → the first.
   - `&` and a single comma are **not** split, so `Earth, Wind & Fire` stays one act.
   - Support acts are never used for the headliner's card.
3. **Deezer verdict:**
   - The name must match exactly, with exactly one id, and a real (non-placeholder) picture whose md5 isn't one of that artist's album covers.
   - Otherwise the reason is recorded (`not-found`, `no-photo`, `ambiguous-same-name`, `album-cover-as-portrait`) along with candidate ids.
4. **MusicBrainz verdict:**
   - Only exact name or alias matches with score ≥ 90 are considered.
   - Evidence: +2 exact name, +2 country = event country, +2 tag overlap with the event genre (plus Greek tags for GR shows), +1 Group/Person type, +0.5 documented entry.
   - Accept a unique hit, or a winner with a margin of 2 or more that includes country or genre evidence. Otherwise mark `ambiguous`.
5. **Cross-service links beat names.** A Deezer id linked from MusicBrainz is used even when Deezer search had several same-named artists.
6. **Humans close the loop.** `block` stops a name for good, and `pin` sets a reviewed photo. Both are re-applied after every run.

---

## 5. Photos for obscure bands

**In order of expected yield:**
1. **Venue event pages** (phase 2). Venues get press photos from bookers for every show, which makes this the single best source for unsigned and local acts.
2. **Deezer.** Most bands that release music digitally (via DistroKid, Bandcamp-to-DSP and similar distributors) have a Deezer artist page. Small acts often upload a photo there.
3. **Artist-submitted photos.** Extend `data/partner-feeds.json` / an issue form so artists and venues can submit a press photo with explicit permission. This is the only legally clean route for the long tail, and it doubles as outreach.
4. **MusicBrainz homepage and Bandcamp links → `og:image`.**
   - Often a real band photo, but sometimes a logo or cover.
   - Put these into a **review queue** (a generated markdown list for manual approval). Never auto-publish them.
5. **Commons and Wikidata.** Greek Wikipedia covers many Greek acts that are absent from English sources, and Wikidata P18 is language-independent.

---

## 6. Caching, attribution and licensing

**Storage:**
- **URLs only.** Deezer forbids storing images, and committing image files would grow the repo with every refresh.
- Commons files *could* be re-hosted (they are licensed). Hot-linking is allowed but discouraged by Wikimedia, so keep it, because the requests are spread across visitors.

**Credits:**
- Every Commons entry carries `licence`, `licenceUrl`, `author` and `credit`. The UI shows `Photo: <author> · <licence> · Wikimedia Commons`, linked to the file page, which satisfies CC BY / BY-SA attribution.
- Deezer entries carry an optional "Photo via Deezer" credit.

**Refresh:**
- Re-verify entries older than about 120 days (roadmap). Deezer changes the URL when an artist replaces their picture.
- Broken images already fall back to the typographic card in the browser.

**Rate etiquette:**
- MusicBrainz: 1.1 s spacing and a contact User-Agent.
- Wikimedia: a standard thumbnail width, serial requests, a contact User-Agent.
- Deezer: 40 per 5 s, with quota retry.

**Corrections:** `data/artist-image-overrides.json`. Add a name to `block` the day a wrong photo is reported.

---

## 7. Roadmap

| Phase | Work | Status |
|---|---|---|
| 0 | Headliner parsing, backoff fix, Deezer throughput and quota handling, album-cover rejection, MusicBrainz identity graph + Commons, credits, overrides | **This branch** |
| 1 (1–2 weeks) | Let 3–4 daily runs clear the backlog. Hand-review a random sample of 50 new matches (precision target ≥ 98%) and block errors. Record coverage in `source-audit.json` | Next |
| 2 | Venue event-page images for the top ~15 NL/BE venues. Take the venue's event URL from the Podiuminfo concert page (already fetched by `podiuminfo-images.mjs`) or from venue agenda pages. Generalise `venue-posters.mjs` allow-lists | Highest remaining gain |
| 3 | Cross-check: for Deezer matches without an MBID, run the identity stage and **replace** the photo when MusicBrainz links a *different* Deezer id. Add the 120-day refresh | Precision |
| 4 | Artist/venue photo submissions (issue form → `pin` with permission recorded) | Long tail |
| 5 | Optional: TheAudioDB/fanart.tv by MBID, with a key in Actions secrets, only if phase 1 data shows a gap they would fill | Optional |

---

## 8. Code changes on this branch

- `js/artist-images.js`:
  - `headlinerNames()` and `artistImageFor()`.
  - `resolveConcertImage()` now resolves derived names and returns `credit`.
  - The Commons host and path are allow-listed.
  - `addPodiuminfoArtists()` keeps the `attempted` state and never downgrades a better portrait.
- `scripts/deezer-artist-images.mjs`:
  - Candidates come from headliner names.
  - A shared rate-limited client with quota retry.
  - Verdict reasons and candidate ids are recorded.
  - Album-cover md5 check.
  - Default budget 450 requests / 240 s.
- `scripts/musicbrainz-identity.mjs` (new): context scoring, url-rels, Wikidata P18, Commons licence checks, Deezer by linked id.
- `scripts/artist-image-overrides.mjs` and `data/artist-image-overrides.json` (new): human block/pin.
- `scripts/rate-limit.mjs` (new): sliding-window limiter.
- `scripts/fetch-events.mjs`: stage wiring; writes `data/artist-identities.json`; stats in `source-audit.json`.
- `.github/workflows/update-events.yml`:
  - Budgets: `DEEZER_ARTIST_IMAGE_REQUESTS=450`, `IDENTITY_LOOKUPS_PER_RUN=120`.
  - Job timeout raised from 25 to 35 minutes. The two image stages add up to about 8 minutes; Actions minutes are free for public repositories.
  - The new data file is committed.
- UI (`js/app.js`, `js/deciding-deck.js`, `css/style.css`): credit lines; cache-busting versions bumped to `identity-v1`.
- `tests/artist-identity.test.mjs` (new): 13 tests covering parsing, verdicts, album-cover rejection, quota retry, backlog advance, context scoring, licence allow-list, the full identity flow, overrides and the rate limiter.

---

## 9. Weaknesses, restrictions and cost

- **Deezer terms are the biggest strategic risk.** Non-commercial and no-storage restrictions are tolerable for a free friends app. **Before any commercial launch, replace Deezer** with venue images, artist-submitted photos and Commons, or get an agreement.
- **Uniqueness ≠ identity.** Short dictionary-word names (`Sef`, `Knoll`, `Distant`, `Caro`) can still match a different act that happens to be the only one with that name on Deezer. Mitigations: the review file now, and the MusicBrainz cross-check in phase 3.
- **Title parsing is heuristic.** It recovers the common patterns but misses things like `Back Alley Ritual: Cutthroat` (we can't tell a series from an act), by design.
- **Commons yield for underground acts is low.** The stage adds clean licences more than it adds coverage.
- **Shared runner IPs.** GitHub-hosted runners share IPs. Deezer and MusicBrainz limits are per IP, so another tenant can trigger 429/503. The stages back off and resume the next day.
- **Running cost:** €0 in services. About 8 extra Actions minutes a day, free for a public repository. Maintenance: occasional provider-format changes, plus a few minutes a week reviewing reported wrong photos.
