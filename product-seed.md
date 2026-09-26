# Product Seed — TrialScout

> A public demo that reads a patient's plain-language profile, checks it against every eligibility criterion of recruiting oncology trials on ClinicalTrials.gov using TypeSafe's Jev, and shows which trials are worth raising with a doctor — each criterion quoted from the source.

---

## Problem Statement
When someone is diagnosed with cancer, finding a clinical trial they could actually join means reading dozens of trial records whose eligibility rules are long, free-text lists of medical jargon. ClinicalTrials.gov search filters only cover condition, location and status. It can't tell a patient which of 150 recruiting trials rule them out on line 14 of the exclusion criteria. Most patients and caregivers give up or depend entirely on whether their oncologist happens to know about a trial.

## Target User
A patient or caregiver in the weeks after a solid-tumour cancer diagnosis, sitting at a laptop before the next oncology appointment. They have a diagnosis, some treatment history and a list of medications, and they want a short, understandable list of trials to ask about, plus the right questions to ask.

## Core Value Proposition
TrialScout lets a newly diagnosed patient see which recruiting oncology trials are worth discussing with their doctor, with every eligibility criterion quoted and marked "likely meets", "likely fails" or "ask your doctor", without reading hundreds of pages of trial jargon.

## Key Features
- Every page shows a permanent red disclaimer strip at the top: "Demo project. Not medical advice. AI picks these quotes from ClinicalTrials.gov and no clinicians have verified them." It cannot be dismissed.
- User can describe themselves in a short guided form: cancer type and stage, age, sex, country and city, maximum travel distance, plus an optional free-text box for treatment history, medications and other conditions.
- User can search without creating an account; the profile lives only in their browser session.
- User sees a ranked list of recruiting oncology trials within their travel distance. Each card shows title, phase, sponsor, nearest site and distance, and a summary count (e.g. "9 likely meets · 1 likely fails · 4 ask your doctor").
- Trials with a likely-failed exclusion or inclusion criterion rank below trials with none; trials with many "ask your doctor" criteria rank lower but stay visible.
- User can open a trial to see every inclusion and exclusion criterion as a checklist. Each row shows Jev's verdict, its confidence and the exact criterion text quoted from ClinicalTrials.gov.
- When the profile lacks the information a criterion needs, the verdict is "ask your doctor", never a guess.
- User can generate a printable "Questions for your doctor" sheet for any trial. It lists the "ask your doctor" criteria rewritten as plain questions, next to the trial ID and a link to the official record.
- Every trial links to its official ClinicalTrials.gov page.
- User can edit the profile and re-run the search without re-entering everything.
- User sees an "About this demo" page explaining how matching works, what Jev is, the limits of the method and why no clinician has verified results.

## Tech Preferences
- TypeScript in strict mode throughout.
- Hono on Cloudflare Workers for the API, the same setup as the builder's previous projects (rxjev.cc). Request validation uses `@hono/typia-validator`, and the client calls the API through Hono's typed RPC client for end-to-end types.
- Cloudflare Workers static assets for the client (same as rxjev.cc), Cloudflare Cron for the daily trial refresh.
- Cloudflare D1 with Drizzle ORM caches trials and their split criteria; Cloudflare KV caches Jev verdicts. No raw SQL.
- Typia validates every external payload, on both frontend and backend: ClinicalTrials.gov API responses, Jev responses, request bodies, the profile form and environment variables. Validators are generated at compile time from plain TypeScript types, and constraints are written as Typia type tags. Zod is not used anywhere in this project.
- The Typia transformer runs through `unplugin-typia` in both the Vite (client) and Wrangler/esbuild (Worker) builds. The first milestone must prove this build setup works.
- TypeSafe AI's Jev is the only AI component. It judges each (patient profile, criterion) pair and returns a typed verdict with a confidence.
- Trial data comes from the ClinicalTrials.gov API v2.
- Errors use RFC 7807 Problem Details.
- No authentication provider in the MVP.

## Constraints
- This is a demo, not a medical product. The red disclaimer strip is always visible on every page, including printed doctor sheets.
- Wording never says "eligible", "qualify" or "match" as a promise; the language is "worth discussing with your doctor".
- Every verdict shown to the user sits next to the verbatim source criterion text it was judged against.
- Missing information must produce "ask your doctor", never an assumed pass or fail.
- No patient data is stored on the server; profiles are sent only for scoring and discarded. No analytics that capture profile contents.
- Jev usage is bounded: hard filters (condition, recruiting status, age, sex, distance) remove trials before Jev sees them. Each search makes at most about 300 Jev calls, and there is a per-IP rate limit to keep a public demo affordable.
- Must be readable on a phone and meet WCAG AA.

## Out of Scope
- No user accounts, saved searches or saved profiles.
- No email or push alerts for new trials.
- No conditions outside oncology (solid tumours) in the MVP.
- No registries other than ClinicalTrials.gov (India's CTRI and the EU CTR are deferred).
- No uploading medical records, PDFs or lab reports.
- No contacting trial sites or sponsors from the app.
- No clinician review workflow and no clinician-labelled evaluation set.
- No native mobile apps.
- No payments or monetisation.
- No languages other than English.

## Additional Context
- This is a showcase for TypeSafe AI's Jev, in the same family as rxjev.cc, which already uses the red disclaimer strip. TrialScout should feel like a sibling of that project.
- Jev was chosen because eligibility criteria are free text that need judgement against a personal profile, which keyword search cannot do.
- No clinician is available, and the project is not intended to become a real product. The disclaimer and the source quotes are the safety mechanism.
- The single biggest failure mode is a false "likely fails" that hides a trial the patient could join. Ranking pushes such trials down rather than removing them.
- Criteria splitting (breaking a trial's eligibility text into individual inclusion and exclusion lines) happens once per trial and is cached for all users. Jev verdicts are cached by criterion plus the relevant profile fields.
- Jev's exact API shape, batching support and pricing must be confirmed from the live TypeSafe docs before system design finalises call budgets.
- Chosen defaults: oncology only; worldwide ClinicalTrials.gov data with a distance filter; recruiting trials only.
- Ideas considered and deferred: a recall and safety alerts app (lower risk, planned as a later project) and a job-board filter.
- Typia replaces Zod on purpose, overriding the builder's global "Zod for all external data" rule for this project only. The reason is an experiment in compile-time validation, which is much faster than Zod at runtime and helps with the Workers CPU budget when validating large trial payloads and hundreds of Jev responses. Known trade-offs: builds depend on a TypeScript transformer, Typia versions are tied to TypeScript versions, and there is no built-in coercion or transforms, so normalisation lives in plain functions.
- Placement: new project at ~/Work/Projects/trialscout, separate from dotnbox.
- Domain: trialscout.cc. The name was chosen over "Find Trial" because "scout" fits "trials worth discussing", not "we found your trial".

## Design Direction
Calm, trustworthy and plain-spoken, a sibling of rxjev.cc. The permanent red disclaimer strip across the top is the one loud element; everything else is quiet. Warm neutral background, one restrained accent colour, and verdict colours (meets / fails / ask your doctor) that stay distinguishable without colour through icons and labels. Large, highly readable type, generous whitespace and one column of content on mobile. Plain language at about an 8th-grade reading level, and medical terms appear only inside quoted source text. Motion only for loading and expanding criteria. It must not look like a hospital portal (no clinical medical blue, no stock photos of doctors) or a wellness app (no gamification, no cheerful illustrations). WCAG AA throughout, and the printed doctor sheet must be clean black-and-white.

---
<!-- Agent Handoff Note

system-design-agent: The red disclaimer strip and verbatim source quotes are the product's safety mechanism — they must appear on every page and every printed sheet. No server-side storage of patient profiles. Jev is the only AI component; keep calls under ~300 per search via hard pre-filters, early exit on confident exclusion fails, and KV caching. Confirm Jev API and pricing from live docs. No auth provider.
  Use Typia everywhere, not Zod. This deliberately overrides the global Zod rule; do not revert it. Wire unplugin-typia into both the Vite and Wrangler builds, and use @hono/typia-validator for routes.

milestone-agent: Milestone 1 = profile form → ClinicalTrials.gov fetch with hard filters → cached criteria split → Jev verdicts → ranked trial list with disclaimer strip. The criterion checklist view and printable doctor sheet follow. Accounts, alerts, other registries and non-oncology conditions are explicitly deferred.

user-stories-agent: Key edge cases surfaced in ideation:
  - Profile omits the data a criterion needs (e.g. ECOG score, HbA1c) → "ask your doctor", never a guess.
  - A trial has a malformed or unsplittable eligibility section → show the raw text with "ask your doctor".
  - Zero trials survive the hard filters → explain which filter to relax (distance, stage).
  - A search hits the rate limit or Jev budget → clear, calm "try again later" state.
  - ClinicalTrials.gov is unavailable → serve cached trials with a "data as of" date.
  - The user prints the doctor sheet → the disclaimer must be printed too.

product-brief-agent: Positioning = "trials worth asking your doctor about", a transparent Jev showcase that quotes its sources. Sibling to rxjev.cc. Explicitly a demo, not a medical product.

design-spec-agent: Reuse the rxjev.cc pattern of a permanent, non-dismissible red disclaimer strip with the exact copy: "Demo project. Not medical advice. AI picks these quotes from ClinicalTrials.gov and no clinicians have verified them." Calm, plain-language, no hospital-blue or gamified styling, colour-blind-safe verdict states with icon and label, WCAG AA, print stylesheet for the doctor sheet.
-->
