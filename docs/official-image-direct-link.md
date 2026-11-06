# Official event image direct links (pilot)

This public app now supports a **source-linked display mode** for official event imagery, without downloading, mirroring, caching or redistributing the image file. The browser loads the HTTPS image URL from the original venue/CDN. A separate link to the official event page appears as the image source credit.

This is **not an assertion that the image is public domain or licensed to us**. The exact copyright status of individual artist/promoter/photographer images is not verified.

## Operating rules

- Artist-specific concert artwork from a **strictly matched original public event page** takes display priority; otherwise the app uses a **verified band photo**, otherwise typography.
- Every direct-linked URL must be HTTPS, a recognized image format and associated with an official venue event page matching the exact date and headliner. Never use arbitrary image search results.
- We do not download, cache, proxy, rehost, bypass hotlink restrictions, defeat access controls, rotate IPs or retry blocked pages. If the remote image refuses to load, the browser falls back to an existing verified artist image or the typographic card.
- Direct-link use is configurable per venue in `data/nl-venue-sources.json` under `imageUse:"direct-link"`. `permitted` remains reserved for recorded licence/permission. `pending` and `denied` are not displayed.
- First pilot: Paradiso, 013, Doornroosje, Effenaar, Patronaat and PAARD (publicly fetched event pages). Blocked sites such as Melkweg, TivoliVredenburg and dB's remain excluded. Review other venues individually before enabling.
- Previously direct-linked photos are revalidated on every update and removed from the published catalogue when the source match disappears or the policy is changed back to pending/denied.
- If any rightsholder objects or imposes anti-embedding restrictions, change `imageUse` to `pending`, remove the URLs from the deployed catalogue via its next update, and promptly process the takedown. For an urgent takedown, remove the affected event image immediately and redeploy.
- Do not confuse an accessible CDN link with sublicensing rights. Get legal review of the implementation before future monetization, especially when a venue claims rights, links contain content originally published without authorisation, or a site blocks embedding.

## Legal context, not a legal opinion

EU case law distinguishes hyperlinks/framing from uploading copyrighted works. Under CJEU C-392/19 *VG Bild-Kunst* (2021), embedding a work that the copyright holder has authorised on an unrestricted public site may be a distinct communication to the public when effective technological restrictions against framing are circumvented. The GS Media line of cases adds further risk where the original publication itself was unauthorised, particularly for profit.

References:
- https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=celex%3A62019CJ0392_RES
- https://www.kvk.nl/en/rules-and-laws/copyright-on-photos-for-your-website/

A link is not a licence. This pilot operates with technical controls and takedown readiness, but it does not guarantee that every venue asset is safe to embed.

## Audit

`scripts/update-venue-catalog.mjs` records `imagesDirectLinked` independently of explicit permitted images. Image candidates retain a `displayMode` marker when they are linked rather than licensed. The data feed contains **URL references only**, not source image bytes.
