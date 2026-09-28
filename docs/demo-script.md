# Demo script: 80-second product video

A recorded screen demo for LinkedIn and X. Most feed video plays muted, so the captions carry the story; the voice-over is optional.

The app is one column, so it records well at 16:9 with the page centred, and crops cleanly to 4:5 or 9:16. The red disclaimer strip stays on screen in every shot. Keep it there; it is part of the message.

The patient is **made up**. Never record a real person's details.

Every beat below was run against live ClinicalTrials.gov and Jev (`jev-1.13.0`) on 2026-09-27, with the local build of `milestone/m4-launch`. ClinicalTrials.gov changes daily, so do the dry run in "Before recording" and check the beats still hold.

## The profile

Type this in the form, exactly:

| Field | Value |
|---|---|
| Cancer type | `non-small cell lung cancer` |
| Stage | Stage IV |
| Age | `58` |
| Sex | Female |
| Country | `India` |
| City | `Pune` |
| How far can you travel? (km) | `300` |
| Past treatments, medicines and other conditions | `EGFR exon 19 deletion. Took osimertinib.` |

## Beats

| Time | Screen | Caption (burned in) |
|---|---|---|
| 0:00 | Empty form under the red strip. Hold on the intro line and the three "How it works" steps. | A cancer trial can list 30 rules for who can join. Which ones apply to you? |
| 0:05 | Fill the four sections (speed it up 2–3×). Tap the **300 km** quick pick. Linger on the notes box and its line "Stays in this browser tab. We don't store it." | A made-up patient: lung cancer, stage IV, near Pune. Plain words, and nothing is stored. |
| 0:14 | Press **Find trials**. Cut the wait: placeholder cards and "Checking trials against your profile…", about 5 s the first time. | |
| 0:17 | The page jumps to the results. Hold on the summary bar ("Checked for: …", "24 recruiting trials within 300 km of Pune…") and the group headings ("Nothing likely rules you out", "Not fully checked"). Scroll slowly past the cards: tags, nearest site, the counts bar and pills. | 24 recruiting trials nearby, each checked against every rule. |
| 0:25 | Stop on **NCT06417814**, *A Study to Investigate the Efficacy and Safety of Dato-DXd With or Without Osimertinib…*, "Research Site, Pune · 0 km" (press **Show 10 more** first if it is past the first ten). Press **Check each rule**. | |
| 0:28 | Zoom on the one **likely meets**: *Must have evidence of documented pre-existing EGFRm information…* | Every answer sits next to the trial's own words, quoted exactly. |
| 0:35 | Press the **Ask your doctor (17)** filter chip ("Showing 17 of 18 rules."). Zoom on *Less than or equal to (<=2) prior lines of EGFR TKIs (osimertinib is the only permitted prior third generation EGFR TKI).* and its callout "To ask: This rule is about treatments I have had before. Does my treatment history affect it?" | Not enough to go on? It says ask your doctor. It never guesses. |
| 0:45 | Press **Hide the rules**, then **Show 10 more** until the heading "Something likely rules you out", with "Listed last, not hidden." Open **NCT06119581**, *A Study of First-Line Olomorasib… KRAS G12C-Mutant Non-small Cell Lung Cancer*, press the **Likely fails** chip, and zoom on *Must have disease with evidence of KRAS G12C mutation.* | A trial that likely rules you out is moved to the bottom. It is never hidden. |
| 0:55 | Press **Print questions for your doctor**, at the top of the opened trial. Record the browser's print preview: the disclaimer at the top, "Rules that may keep me out", and under the KRAS rule, "The check suggests I do not meet this rule. Is that right?" | Take a question sheet to your doctor. The warning prints too. |
| 1:05 | *Optional, cut first if long.* Close the preview. **Change your answers**: `glioblastoma`, Stage "Not sure", age `45`, Male, `Argentina`, `Ushuaia`, `50` km, no notes. **Find trials**: "No trials to show… Try a larger travel distance, or a broader cancer type such as "lung cancer"." | When nothing is nearby, it says what to change. |
| 1:12 | Header: **About this demo**. Scroll past "What it cannot do" and "Why no doctor has checked these results". Then the end card (added in the edit). | TrialScout is a demo, not medical advice. Rule checks by TypeSafe Jev. Trial data from ClinicalTrials.gov. |

## What each beat showed on 2026-09-27

- **Search:** 24 trials, all with their criteria split; 269 Jev questions in 30 requests, about 4 s. A repeat of the same profile comes from the verdict cache, so later takes are instant.
- **Where trials land:** the list order and the size of the "Something likely rules you out" section move from run to run as ClinicalTrials.gov and the cached verdicts change (6 and then 12 trials in two runs that day), so find the two trials by NCT ID.
- **NCT06417814** (7th in the list): 1 likely meets, 17 ask your doctor, 0 likely fails. The EGFR rule was likely meets at 0.99; the prior-TKI rule was ask your doctor at 0.71.
- **NCT06119581** (24th, last): on opening, 3 likely fails, 14 ask your doctor. The three fails are all right for this made-up patient:
  - *Must have disease with evidence of KRAS G12C mutation.* (0.94). She has an EGFR mutation instead.
  - The exclusion for *a documented additional validated targetable oncogenic driver mutation… (EGFR)…* (0.99).
  - The exclusion for *Prior systemic therapy… for advanced or metastatic…* disease (0.92). She took osimertinib.
- **Card counts** show what the search checked until the trial is opened. Opening it checks the rules the search left "not checked yet", and the card's counts update to match: the KRAS card went from 2 likely fails and "11 not checked yet" to 3 likely fails. A trial with rules left unchecked sits under "Not fully checked", never under "Nothing likely rules you out", and stays there after opening; if the full check finds a likely fail, the card says "Checking every rule found something that likely rules you out."
- **Ushuaia:** no trials within 50 km, with the "larger travel distance" hint. No Jev call.

### Backups if a beat changes on the day

- **Hero trial:** **NCT07100080**, *Izalontamab Brengitecan… EGFR-mutated NSCLC After Failure of EGFR TKI Therapy*. It has 8 rules; likely meets on *Documented evidence of EGFR mutation (exon 19 deletion, L858R mutation).* (1.00). Its card says "Distance not known", which is weaker on camera.
- **Likely fails at the bottom:** any of the last five cards (NCT05865002, NCT06890598, NCT06561386, NCT06758401, NCT05278052) had one likely fail each.

### Avoid these on camera

- **NCT06417814's other questions.** Three of its "To ask" lines use the wrong topic: the osimertinib-progression rule and the "Use of chemotherapy…" exclusion both get "This rule is about where the cancer has spread", and the "severe or uncontrolled systemic diseases" exclusion gets the infections question. Zoom only on the prior-TKI rule. (Fixed on `task/doctor-question-topics`, not yet merged: once it is, all three get the treatments or "other health problems" question.)
- **NCT06350097** (first-line osimertinib). Its list includes a stray rule that reads just "Age" (a heading split as a rule, 0.36). Its "must not have received prior EGFR TKIs" rule is ask your doctor even though the notes say she took osimertinib: cautious, but it reads as a miss.
- **NCT06899126**, first in the list. It is for HER2-overexpressing NSCLC. It ranks first only because the profile doesn't say her HER2 status, so nothing likely rules her out. Don't open it; a viewer may ask why it is first.
- **A breast cancer search in Boston as the main example.** It finds 90 trials. Only the first 18 or so get checked within the 300-question search budget; the rest show "not checked yet" until opened, and many are not breast-specific.

## Before recording

1. **Run the app locally:** `make -j2 dev`, then open http://localhost:5173. `make db-local` must have run once, for the city data. Nothing is deployed yet; if you record after launch, use https://trialscout.cc and skip step 3.
2. **Do one full dry run of every beat**, then check the cards, counts and quotes still match the section above. It also fills the verdict cache, so the takes load instantly and cost nothing more.
3. **Raise the per-client limits for the session.** The app allows 5 searches a minute and 20 trial checks a minute. Add these to `apps/worker/.dev.vars`:

   ```
   SEARCH_PER_MINUTE=30
   TRIAL_CHECKS_PER_MINUTE=60
   ```

   Restart `make -j2 dev` (the API Worker doesn't reload on its own), and remove both lines afterwards.
4. **Start each take in a fresh tab.** The profile lives in the tab's session storage, so a new tab opens an empty form.
5. **Browser:** use a clean profile, with one tab and no bookmarks bar. Use a 1440×900 window at 110–125% zoom, so the cards fill the frame. Pick light mode and keep it for every take. Hide the address bar in the edit if it shows `localhost`.
6. **Print preview:** record the preview, and don't print. Leave background graphics off: the sheet is black and white by design.
7. **Record and edit.** Record at 60 fps. In the edit:
   - Cut the search wait.
   - Burn in the captions.
   - Export 1920×1080, plus a 4:5 crop for the feed.

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
