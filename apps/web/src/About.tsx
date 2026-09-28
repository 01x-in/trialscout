import { type JSX, type ReactNode, useEffect } from 'react'
import { SiteHeader } from './SiteHeader.tsx'

// "About this demo": how the check works, what Jev is, its limits and why no clinician has
// checked the results. Plain words for an 8th-grade reader; no promises of a place on a trial.

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}): JSX.Element {
  return (
    <section
      className="space-y-3 border-t pt-8 [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6"
      aria-labelledby={id}
    >
      <h2 id={id} className="font-semibold text-xl tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  )
}

export function About(): JSX.Element {
  // The page renders after load, so a link such as /about#about-privacy cannot jump on its
  // own: jump once the section exists. Instantly, with no motion.
  useEffect(() => {
    const target = window.location.hash.slice(1)
    if (target !== '') document.getElementById(target)?.scrollIntoView?.()
  }, [])
  return (
    <>
      <SiteHeader page="about" />
      <main className="mx-auto max-w-3xl space-y-8 px-4 pt-8 pb-16 text-base leading-relaxed [overflow-wrap:break-word]">
        <div className="space-y-3">
          <p className="text-sm">
            <a href="/" className="font-medium">
              Back to the trial search
            </a>
          </p>
          <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">About this demo</h1>
          <p className="text-lg text-muted-foreground">
            TrialScout is a demo. It shows how an AI model can check the rules of a cancer trial
            against what a patient tells it. It is not a medical service.
          </p>
        </div>

        <Section id="about-how" title="How the check works">
          <p>You tell us about your cancer, your age, your sex and where you live.</p>
          <ol>
            <li>
              We ask ClinicalTrials.gov for cancer trials that are looking for people now, with a
              site near your city.
            </li>
            <li>
              We set aside trials for a different age or sex, or with no site within the distance
              you chose.
            </li>
            <li>We break each trial's rules into a list. Plain computer code does this, not AI.</li>
            <li>
              For each rule, the AI model Jev gives one answer: likely meets, likely fails or ask
              your doctor. Next to every answer we quote the rule it read, word for word.
            </li>
            <li>
              Trials where a rule likely keeps you out go to the end of the list. They are never
              hidden, because the AI can be wrong.
            </li>
          </ol>
        </Section>

        <Section id="about-jev" title="What Jev is">
          <p>
            Jev is an AI model made by TypeSafe AI. It does not write text. It reads a question,
            picks an answer from a short, fixed list and says how sure it is.
          </p>
          <p>
            When Jev is not sure enough, or you did not tell us something a rule needs, we show "ask
            your doctor". We never guess a yes or a no for you. Jev never sees your city or country.
          </p>
        </Section>

        <Section id="about-limits" title="What it cannot do">
          <ul>
            <li>It only knows what you typed. It cannot read your medical records.</li>
            <li>
              It can be wrong, and it can be sure and still wrong. Some rules are hard for it, such
              as blood test numbers, dates and time limits, and trials with several groups of
              patients.
            </li>
            <li>
              It only covers cancer trials listed on ClinicalTrials.gov. Trial details there can be
              out of date, and a site may have stopped taking people.
            </li>
            <li>
              If ClinicalTrials.gov is not answering, we show our saved copy and say how old it is.
            </li>
          </ul>
        </Section>

        <Section id="about-clinicians" title="Why no doctor has checked these results">
          <p>
            This is a demo of what the AI can do, so no doctor, nurse or trial team has checked any
            of its answers. Only a trial's own team can say whether you can take part.
          </p>
          <p>
            Use the list to start a talk with your doctor. The printed sheet of questions is there
            to help with that.
          </p>
        </Section>

        <Section id="about-privacy" title="Your answers stay with you">
          <p>
            There are no accounts. Your answers are kept only in this browser tab, and they are gone
            when you close it. We send them to our server to check trials, then throw them away. We
            do not store them, log them or use them for tracking.
          </p>
          <p>
            To do the check, ClinicalTrials.gov gets your cancer type and the place you search near.
            Jev gets your cancer type, stage, age, sex and notes, but not where you live.
            ClinicalTrials.gov and TypeSafe AI, who make Jev, keep what they get under their own
            terms.
          </p>
          <p>Two things are kept for a short time, and neither holds your answers:</p>
          <ul>
            <li>
              Jev's answers for each trial, for up to 7 days, so the same check is not paid for
              twice. They are filed under a scrambled code, with nothing that says who asked.
            </li>
            <li>
              Your internet address and the times you searched or checked a trial, for up to a day,
              to limit how often one connection can search.
            </li>
          </ul>
        </Section>

        <Section id="about-data" title="Where the data comes from">
          <ul>
            <li>
              Trial details come from{' '}
              <a href="https://clinicaltrials.gov/" target="_blank" rel="noreferrer">
                ClinicalTrials.gov
              </a>
              , run by the U.S. National Library of Medicine.
            </li>
            <li>
              City names and places come from{' '}
              <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">
                GeoNames
              </a>
              , shared under{' '}
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noreferrer"
              >
                CC BY 4.0
              </a>
              .
            </li>
            <li>Rule checks come from Jev, by TypeSafe AI.</li>
          </ul>
        </Section>
      </main>
    </>
  )
}
