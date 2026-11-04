# Venue-first concert discovery roadmap

The app can track any number of music venues, but every venue needs its own verified event source and tested adapter. Adding a URL alone does not produce reliable events.

See `data/venue-registry.json` for official venue program locations and adapter states.

- **Active:** Gagarin 205 iCalendar feed (`scripts/fetch-events.mjs`) and optional poster metadata enrichment (`scripts/venue-posters.mjs`).
- **Planned:** AN Club live event listings and Fuzz Club's official event calendar. Both need source-specific parsing, review of access terms/robots guidance, and date/artist/source tests before scheduled automation.
- **Research:** Kyttaro and Half Note. Avoid assuming that ticket marketplace pages expose complete venue programs.

For every next venue: verify its official calendar, obtain permission where required, extract only music events and their true dates, link back to the original source, reuse its poster URL when permitted, keep a last-good cache, and deduplicate on country/date/artist/venue. Never represent unknown sources as fully verified, and never turn on unsupported scraping merely by listing a venue.

The `Discover` view is preference-matched event search. `Deciding` is the swipe queue of recommended or saved concerts. `All shows` includes indexed concerts even without genre metadata.
