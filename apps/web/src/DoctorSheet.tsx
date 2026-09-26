import type { CriterionVerdict, Profile, TrialVerdictsResponse } from '@trialscout/contract'
import type { JSX } from 'react'
import { DISCLAIMER } from './DemoCaution.tsx'
import { dateLabel } from './format.ts'
import { doctorQuestion } from './questions.ts'

// The printed "Questions for your doctor" sheet: black and white, with the disclaimer at the
// top of every page. A table's header group repeats on each printed page, so the disclaimer
// sits in one; the table is for layout only.

function describeProfile(profile: Profile): string {
  const stage = profile.stage === 'unknown' ? 'stage not known' : `stage ${profile.stage}`
  return `${profile.cancerType}, ${stage}, age ${profile.age}, ${profile.sex}.`
}

function Question({ criterion }: { criterion: CriterionVerdict }): JSX.Element {
  return (
    <li>
      <blockquote className="criterion-text">{criterion.text}</blockquote>
      <p className="sheet-question">{doctorQuestion(criterion)}</p>
    </li>
  )
}

function Questions({
  id,
  label,
  rules,
}: {
  id: string
  label: string
  rules: CriterionVerdict[]
}): JSX.Element | null {
  if (rules.length === 0) return null
  return (
    <section>
      <h3 id={id}>{label}</h3>
      <ol className="sheet-list" aria-labelledby={id}>
        {rules.map((c, i) => (
          <Question key={`${i}-${c.text}`} criterion={c} />
        ))}
      </ol>
    </section>
  )
}

type Props = { trial: TrialVerdictsResponse; profile: Profile; site: string }

export function DoctorSheet({ trial, profile, site }: Props): JSX.Element {
  const ask = trial.criteria.filter(
    (c) => c.verdict === 'ask_your_doctor' || c.verdict === 'not_checked',
  )
  const fails = trial.criteria.filter((c) => c.verdict === 'likely_fails')
  const met = trial.counts.likely_meets
  const notes = profile.notes?.trim()

  return (
    <div role="document" aria-labelledby="sheet-title" className="doctor-sheet">
      <table role="presentation" className="sheet-layout">
        <thead>
          <tr>
            <td>
              <p className="sheet-caution">{DISCLAIMER}</p>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <h2 id="sheet-title">Questions for your doctor</h2>
              <dl className="sheet-trial">
                <dt>Trial</dt>
                <dd>{trial.title}</dd>
                <dt>Trial ID</dt>
                <dd>{trial.nctId}</dd>
                <dt>Official page</dt>
                <dd>{trial.url}</dd>
                <dt>Nearest site</dt>
                <dd>{site}</dd>
              </dl>
              <p>
                What I entered: {describeProfile(profile)}
                {notes ? ` My notes: ${notes}` : ''}
              </p>

              {trial.eligibility === 'unsplittable' ? (
                <section>
                  <p>
                    The check could not turn this trial's rules into a list. Please go through them
                    with me:
                  </p>
                  <blockquote className="criterion-text criterion-raw">
                    {trial.rawCriteria ?? 'ClinicalTrials.gov lists no rules for this trial.'}
                  </blockquote>
                </section>
              ) : (
                <>
                  <Questions id="sheet-fails" label="Rules that may keep me out" rules={fails} />
                  <Questions id="sheet-ask" label="Rules to ask about" rules={ask} />
                  {met > 0 && (
                    <p>
                      {met} {met === 1 ? 'rule' : 'rules'} looked likely to be met. Every rule is on
                      the official page above.
                    </p>
                  )}
                </>
              )}

              <p className="sheet-footer">
                Rules checked by AI against the trial details from ClinicalTrials.gov,{' '}
                {dateLabel(trial.dataAsOf)}. Printed from trialscout.cc.
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
