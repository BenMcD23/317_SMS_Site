# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Squadron staff, SNCOs and NCOs of 317 (City of Ely) Squadron, RAF Air Cadets.
Staff do admin on laptops at home: stores, orders, comms, stats, documents.
NCOs use it on phones on parade nights: registers, cadet records, marking
sheets, inspections, orders. Access is role-gated (staff / owner / OC / SNCO /
NCO).

## Product Purpose

The squadron's management system. It mirrors cadet, event and qualification
data scraped from Bader (SMS) and adds what Bader lacks: stores and orders,
assessments and marking sheets, inspections, classifications, parade-night
texts, stats, and document/form generators. Success: an adult volunteer can
find a cadet, act on an order or record a result in seconds, on whatever
device is in their hand.

## Positioning

Built for one squadron's real parade night, not a generic cadet tool: it knows
317's flights (A–C), ranks, kit list, badge catalogue and routines, and it
fills Bader's gaps instead of duplicating it.

## Operating Context

Parade nights (weekday evenings, drill hall, phone in hand, interrupted);
weekend admin on a laptop. Data comes from scrapers, so lists can be empty or
stale; the backend is the SMS Scrapers API. The cadet portal
(`317_cadet_portal`) shares the palette and API.

## Capabilities and Constraints

Next.js App Router + shadcn/ui + Tailwind v4. Sidebar navigation driven by
`lib/navigation.ts`; ⌘K palette. Light and dark themes (dark default). Page
widths are fixed to three tiers and test-enforced. Pass marks and text limits
are shared with the API. Print/PDF output for some pages.

## Brand Commitments

317 Sqn identity: RAF navy primary, cool neutrals, dark sidebar in both
themes, squadron crest in the sidebar. Plain, direct British English. The
visual change in progress is a hard refinement of this identity, not a
replacement.

## Evidence on Hand

Seeded preview data (API `app/scripts/dev_server.py`) mirrors production
shapes. No real cadet data may appear in screenshots or docs.

## Product Principles

1. The task beats the chrome: show the list, the record, the action; don't frame it.
2. Phone on parade night counts as much as the laptop at home.
3. Stale or empty data is normal; say so plainly and never invent it.
4. One way to do each thing: shared components, not per-page variants.

## Accessibility & Inclusion

Volunteers of all ages and eyesight; usable one-handed on a phone. Keyboard
and screen-reader reachable controls (tests query by role and name).
