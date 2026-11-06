# Listening Mirror Friends — artwork permissions

## Display policy (locked)

1. Official **specific-event artwork** with documented rights to display on this independent concert-discovery service.
2. Otherwise a **photograph of the correctly identified artist** from an approved source.
3. Otherwise the existing designed typographic fallback.

Finding a URL or a Deezer/Wikidata identifier is not, by itself, permission to reproduce or publicly display the image. Hotlinking a source's CDN is not proof of permission either.

## Dutch venue / artist-publisher outreach

**Subject:** Toestemming gebruik concertbeelden — onafhankelijke concertagenda

Hallo,

Wij ontwikkelen *Listening Mirror Friends*, een onafhankelijke concertontdekker waarin gebruikers concerten kunnen bekijken en bewaren. Bij een concert tonen wij bij voorkeur de officiële promotieafbeelding van dat specifieke evenement, met een link naar de officiële evenementpagina. Als die niet beschikbaar of niet toegestaan is, tonen wij liever een goedgekeurde artiestenfoto.

Mogen wij voor de evenementen van [VENUE] op onze publieke website/app de officiële evenementafbeeldingen en, waar van toepassing, goedgekeurde artiestenpersfoto's tonen?

Wij horen graag:
- Of deze afbeeldingen ook door **onafhankelijke concertagenda's** mogen worden gebruikt, of uitsluitend door de zaal en organisator.
- Of dit via directe afbeelding-URL's (hotlinking) mag, via lokaal cachen, of beide.
- Of naamsvermelding/credit, een link naar de fotograaf of aanvullende voorwaarden verplicht zijn.
- Of deze toestemming ook geldt bij eventuele toekomstige commerciële activiteiten (bijvoorbeeld een premium abonnement), of dat daarvoor aparte toestemming nodig is.
- Of jullie zelf bevoegd zijn om die toestemming te geven voor de artiestenfoto's, en bij wie wij anders terechtkunnen.
- Of er een officiële mediafeed, API of persmap is die hiervoor bedoeld is.

Tot schriftelijke bevestiging gebruiken wij deze concertafbeeldingen niet vanuit jullie website. Alvast hartelijk dank voor jullie hulp!

Met vriendelijke groet,
Listening Mirror Friends

## English outreach for Deezer developer support

**Subject:** Permission request: Deezer artist photographs in independent concert discovery app

Hello Deezer Developer Relations,

We are developing *Listening Mirror Friends*, an independent public concert discovery app (not a music streaming client). We currently use artist metadata to identify the correct performers and would like explicit guidance on whether and under what conditions Deezer artist image CDN URLs returned by the public Artist API can be displayed in this separate app.

Please clarify whether photo hotlinking and cached image URLs are authorized, mandatory image attribution and links, your approval process, and whether usage is permitted for a free public product and for any future commercial or subscription-based version. We will not assume that a public image URL grants a sublicence to the underlying artwork.

Thank you,
Listening Mirror Friends

## Approval workflow

1. Keep a venue's `data/nl-venue-sources.json` `imageUse` as `pending` (or `denied`) while awaiting rights confirmation. Do **not** set `permitted` merely because the venue page is public.
2. Obtain written permission **from the actual authorized rights holder** covering event assets and/or artist press images; a venue may not own those rights.
3. Record the rights holder, evidence URL/message reference, scope, allowed usages (hotlink/cache), effective date, attribution rules, commercial restrictions, expiry and withdrawal contact. Never put private email addresses or private communications into the public repository; keep a private record and public-safe confirmation reference.
4. Update the venue image policy only after the evidence has been checked. If an agreement covers only a **specific photo**, approve only that individual asset, not every venue image.
5. Test actual loading, source correctness and credits in Deciding / Tonight / Archive.
6. On takedown or permission expiry, disable or remove the affected image immediately.

**Current state:** venue images are intentionally unpublished (12 pending venues, dB's denied). The official [Deezer developer terms](https://cdn-content.dzcdn.net/pdf/CGU-developers.pdf) also include restrictions on commercialization and require Deezer's approval for developer apps; get explicit current guidance before expanding public/commercial use. This document is an operational checklist, not a legal opinion.
