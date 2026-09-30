# Demo script: 2-minute product video

A recorded screen demo for the landing page, LinkedIn and X. Most feed video plays muted, so the captions carry the story; the voice-over is optional.

Record on `/search`, at 1440×900. From 1024px wide the page shows the form in the left third and the results in the right two thirds, which fills a 16:9 frame. Do not record the landing page (`/`): it hosts the finished video. The red disclaimer strip stays on screen in every shot. Keep it there; it is part of the message.

The patient is **made up**. Never record a real person's details.

The beats below were last run against live ClinicalTrials.gov and Jev (`jev-1.13.0`) on 2026-09-30, on trialscout.cc. ClinicalTrials.gov changes daily, so do the dry run in "Before recording" and check the beats still hold.

## The profile

Type this in the form, exactly:

| Field | Value |
|---|---|
| Cancer type | `breast cancer` |
| Stage | Stage IV |
| Age | `50` |
| Sex | Female |
| Country | type `Uni` and pick **United States** from the suggestions |
| City | `Honolulu` |
| How far can you travel? | the **500 km** pick |
| Past treatments, medicines and other conditions | `ER-positive, HER2-negative. Just found it has spread to the bones. No treatment for it yet.` |

## Beats

| Time | Screen | Caption (burned in) |
|---|---|---|
| 0:00 | Empty `/search`: the form in one card on the left, and "Trials worth discussing with your doctor will show here…" on the right. Hold. | A cancer trial can list 30 rules for who can join. Which ones apply to you? |
| 0:06 | Fill the form (speed it up 2–3×). Show the country suggestions, then click the **500 km** pick. Linger on the notes box and its line "Stays in this browser tab. We don't store it." | A made-up patient: breast cancer, stage IV, in Honolulu. Plain words, and nothing is stored. |
| 0:20 | Click **Find trials**. Cut the wait: the placeholder cards on the right and "Checking trials against your profile…", about 5 s the first time. | |
| 0:26 | The results land on the right while the form stays in view on the left. Hold on the summary ("Checked for: breast cancer, stage IV, age 50, female", "18 recruiting trials within 500 km of Honolulu…") and the group headings. Scroll the results slowly: tags, nearest site, counts bar and pills. | 18 recruiting trials nearby, each checked against every rule. |
| 0:42 | Open **NCT07085767**, *Palazestrant in Combination With Ribociclib for the First-line Treatment of ER+/HER2-…*. Press **Check each rule**. | |
| 0:48 | Zoom on the **likely meets** rule *ER+, HER2- locally advanced or metastatic breast cancer…* | Every answer sits next to the trial's own words, quoted exactly. |
| 0:56 | Press the **Ask your doctor** filter chip. Zoom on a rule with its callout, "To ask: This rule is about treatments I have had before. Does my treatment history affect it?" | Not enough to go on? It says ask your doctor. It never guesses. |
| 1:06 | Close the trial and scroll the results to "Something likely rules you out", with "Listed last, not hidden." | A trial that likely rules you out is moved to the bottom. It is never hidden. |
| 1:16 | Reopen the trial and press **Print questions for your doctor**. Record the browser's print preview: the disclaimer at the top, and the questions. | Take a question sheet to your doctor. The warning prints too. |
| 1:28 | Close the preview and press **Official page**. Hold on the ClinicalTrials.gov page. | Every trial links back to its official page. |
| 1:36 | *Optional.* Header: **About this demo**, scrolled past "What it cannot do". Then the end card (added in the edit). | TrialScout is a demo, not medical advice. Rule checks by TypeSafe Jev. Trial data from ClinicalTrials.gov. |

## What the beats showed on 2026-09-30 (the published video)

- **Search:** 18 recruiting trials within 500 km of Honolulu; 7 of them with nothing that likely rules her out; the rest under "Something likely rules you out", listed last (not scrolled to in the published video). The top card, **NCT07492641** (BGB-43395 plus letrozole), showed 3 likely meets and 5 ask your doctor, and was opened for its 8 rules.
- **NCT07085767** (palazestrant plus ribociclib): opened, 14 rules (9 ask your doctor, 5 likely meets). *ER+, HER2- locally advanced or metastatic breast cancer that is not amenable to curative therapy* was likely meets at 99%.
- The list order, the counts and the size of the "likely rules you out" section move from run to run as ClinicalTrials.gov and the cached verdicts change, so find the trial by NCT ID and re-read the numbers on the dry run.
- Opening a trial checks the rules the search left "not checked yet", and the card's counts update to match. A trial with rules left unchecked sits under "Not fully checked", never under "Nothing likely rules you out".

### Avoid these on camera

- **A search where a trial's other "To ask" lines use the wrong topic.** The wording is better since `task/doctor-question-topics` (PR #7), but read each callout you zoom on and pick one that fits its rule.
- **Big cities with many trials** (Boston, Houston). A search reads the first 100 ClinicalTrials.gov returns and checks about 18 within the 300-question budget; the rest show "not checked yet" until opened.
- **Lung cancer.** The old take used it, and its trials had rules that read oddly out of context (a stray rule that reads just "Age", or "must not have received prior EGFR TKIs" as ask your doctor). Breast cancer in Honolulu gave the cleanest run.

## Before recording

1. **Run the app locally:** `make -j2 dev`, then open http://localhost:5173/search. `make db-local` must have run once, for the city data. Nothing is deployed yet; if you record after launch, use https://trialscout.cc/search and skip step 3.
2. **Do one full dry run of every beat**, then check the cards, counts and quotes still match the section above. It also fills the verdict cache, so the takes load instantly and cost nothing more.
3. **Raise the per-client limits for the session.** The app allows 5 searches a minute and 20 trial checks a minute. Add these to `apps/worker/.dev.vars`:

   ```
   SEARCH_PER_MINUTE=30
   TRIAL_CHECKS_PER_MINUTE=60
   ```

   Restart `make -j2 dev` (the API Worker doesn't reload on its own), and remove both lines afterwards.
4. **Start each take in a fresh tab.** The profile lives in the tab's session storage, so a new tab opens an empty form.
5. **Browser:** use a clean profile, with one tab and no bookmarks bar. Use a 1440×900 window at 100–125% zoom. Below 1024 CSS pixels the page becomes one column, so do not zoom further. Pick light or dark with the header switch and keep it for every take. Hide the address bar in the edit if it shows `localhost`.
6. **Print preview:** record the preview, and don't print. Leave background graphics off: the sheet is black and white by design.
7. **Record and edit.** Record at 60 fps. In the edit:
   - Cut the search wait.
   - Burn in the captions.
   - Export 1920×1080. For the feed, crop to 4:5: the split layout crops badly, so use a separate phone-width recording (375×812) rather than a crop.

## Wording checks

- **Captions and the post never use "eligible", "qualify" or "match"**, or anything that promises a place on a trial. Say "worth discussing with your doctor".
- **The three verdicts are exactly "likely meets", "likely fails" and "ask your doctor".** Don't paraphrase them in captions.
- **Don't say the AI finds, picks or recommends trials.** ClinicalTrials.gov's search finds them. Jev answers one question per rule, and the code ranks the trials.
- **Say the patient is made up**, on screen or in the post.
- **The video is recorded before the GATE 1 and GATE 2 reviews.** So:
  - Call TrialScout a prototype.
  - Keep "not medical advice" in both the video and the post.

## Draft post

> Clinical trials list who can join in long, dense rules. Finding which ones apply to you is hard, even with a doctor's help.
>
> I built a prototype, TrialScout. Describe a cancer in plain words, and it checks every rule of the recruiting trials nearby on ClinicalTrials.gov. Each rule gets "likely meets", "likely fails" or "ask your doctor", shown next to the trial's own words. When it lacks the information, it says ask your doctor instead of guessing. Trials that likely rule you out are listed last, never hidden. You can print the open questions to take to your doctor.
>
> The patient in the video is made up. Your answers stay in your browser tab: nothing is stored or logged.
>
> Rule checks by TypeSafe's Jev, which answers typed questions rather than writing text. A sibling of rxjev.cc.
>
> A demo, not medical advice. No clinician has checked these results.
