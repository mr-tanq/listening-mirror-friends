# Authorized event imports: ComeTogether and TicketServices

These providers have useful public music listings, but we have **not** established permission to collect their content automatically for a public third-party app. The app must not crawl them without an appropriate authorization or official feed agreement.

The module `scripts/partner-feeds.mjs` performs **offline validation and merging only**. It never contacts a website. The daily catalog job reads `data/partner-feeds.json` and imports nothing until the explicit provider flag `permissionConfirmed` is true AND vetted event objects are supplied. Do not mark it true without documented authorization.

Example structure for an approved source:

```json
{
  "providers": {
    "ticketservices": {
      "permissionConfirmed": false,
      "events": []
    },
    "cometogether": {
      "permissionConfirmed": false,
      "events": []
    }
  }
}
```

Only single-date music events with a valid organizer URL, artist, venue, city, and Greek country code are accepted. Malformed records are discarded, duplicates are not added, and event metadata is not represented as confirmed unless supplied from an authorized feed. We do not assume that a publicly visible page is a licensed API.

Run `npm test` to verify the import safeguards. A future authorized feed connector can populate the JSON without changing the public UI.
