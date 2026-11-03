# Listening Mirror — Friends Edition

**A completely separate Listening Mirror for friends without Last.fm.** Includes only **Tonight** and **Archive**, with the same dark/ember visual direction as the original app.

## What a friend can do

- On first use: pick favorite music genres, favorite artists, and country/city. No account or Last.fm required.
- **Tonight → For you:** discover matches for their taste from a shared, automatically updated concert catalog. Save **Going**, **Deciding**, or **Pass**.
- Add a show manually and move an attended show to **Archive**.
- **Archive:** past shows, the bands seen most, total concerts and cities, a year-by-year history.
- Export/import a JSON backup of their personal data.
- Every friend has a **separate profile on their own device/browser**, stored in localStorage. No one sees the original owner's concert history.

## Where concerts come from (NO Ticketmaster)

The GitHub Action reuses the actual tested public event-search modules from [`mr-tanq/concerts`](https://github.com/mr-tanq/concerts), **read-only**, for:

- **Podiuminfo:** its day-by-day concert agenda, followed by verification of individual concert pages.
- **Festivalinfo:** verified festival editions and confirmed lineup artists.
- **Official venues:** optional rotating checks for artists in the shared editorial watchlist, using the existing official-venue search logic.

For artist genre metadata **only** (not concert discovery), the scheduled updater can query MusicBrainz with its public read-only API, respectfully limited to ~1 request per 1.3 seconds. No MusicBrainz login or API key is required.

**IMPORTANT:** This first version is a rolling shared catalog, *not yet* an on-demand search across every source for every possible band typed by every friend. New users instantly match what's already in the public catalog, but their private musical preferences are not uploaded to the repository and do **not** trigger a fresh server search. A separate secure request service will be needed to replicate the original per-artist on-demand discovery for arbitrary friend profiles. The catalog builds incrementally, and coverage is incomplete. It currently mainly covers **the Netherlands and Belgium**. This limitation is shown in Tonight.

## Publish as a brand-new repository

1. Create an **empty public** repository named `listening-mirror-friends` under the GitHub account `mr-tanq`. Do **not** fork or edit the original `concerts` repository.
2. Unzip this archive and upload the **contents** (not the outer folder) to the new repository root. Keep the `.github/workflows` folder; the hidden `.github` directory is essential. Alternatively, use a Git push via Codespaces (command below).
3. Go to **Settings → Pages → Build and deployment → Deploy from a branch**. Choose `main`, `/(root)` and Save.
4. Go to **Actions → Update event catalog → Run workflow → Run workflow**. The workflow downloads the existing scrapers read-only, tests the new code, visits public event websites, and commits `data/events.json` plus discovery caches to the *new* repository. It is scheduled daily afterwards.
5. When Pages publishes, the expected URL is `https://mr-tanq.github.io/listening-mirror-friends/`. Share this with friends; no credentials are required for them.

**No API keys or GitHub secrets are needed** for the catalog updater. The first run takes more work because its caches are empty, so the catalog grows over successive daily runs. GitHub Actions and source websites can impose limits; it is not guaranteed that any individual show will be discovered.

### Quick upload from GitHub Codespaces

Create the new empty public repository first. Open its Codespace, upload and unzip the provided ZIP into a temporary directory, then run (from its repo root):

```bash
cp -a /tmp/listening-mirror-friends/. .
git add .
git commit -m "Initial Listening Mirror Friends Edition"
git push
```

Change `/tmp/listening-mirror-friends` to the directory where you actually extracted the files. Avoid `git add .` until you've confirmed that `.source/` and other temporary files are not present. `.source/` is gitignored automatically.

## Optional admin watchlist

Edit `data/artist-watchlist.json` in the new repository, for example:

```json
{"artists":["MONO","Amenra","Sigur Rós"]}
```

The public updater prioritizes those bands and rotates extra **official venue checks** among them. Do not confuse this with any friend's private favorite artists: the local profile is private to their browser.

## Privacy and limitations

- Personal preferences, Going, Deciding and Archive live **only in the browser's storage**. Clearing the browser or changing phones can wipe them; **Export backup** regularly. There is no multi-device cloud sync yet.
- Event pages, photos and genres may be missing, stale, or inaccurate; refer to the official venue/source link before booking.
- Artist and genre matching can only match verified events and available genre metadata. The catalog's genre coverage grows gradually, with incomplete tagging for niche artists.
- NL/BE is the core automated coverage in v1, even though the form allows manual archive entries in other countries.
- The original public `mr-tanq/concerts` repository is **read**, never changed, by this new app's nightly workflow. Updates to the original scraper code may eventually need corresponding maintenance here.
- On-demand custom searches, an extensive venue list, cross-device user accounts, and deeper Archive statistics remain next improvements.

## Project layout

```text
index.html                     Mobile-first Tonight + Archive UI
css/style.css                  Listening Mirror-inspired design
js/app.js                      Profiles, tonight, archive, local backup/restore
js/model.js                    Ranking, formatting, safe links
scripts/fetch-events.mjs       Existing Podiuminfo/Festivalinfo venue source adapters + optional genre enrichment
.github/workflows/update-events.yml
                               Scheduled catalog refresh, read-only checkout of old scrapers
data/events.json               Public verified event feed
data/discovery-cache.json      Rate-limited adapter cache
data/artist-tags.json         Genre metadata cache
data/artist-watchlist.json    Optional public editorial watchlist
```

## Local verification

```bash
npm test
python3 -m http.server 8080
```

Open `http://localhost:8080/` on the same computer. The frontend runs without a Node build; a web server is needed to load its JSON feed.
