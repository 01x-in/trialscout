import type { CriterionVerdict, TrialVerdictsResponse } from '@trialscout/contract'
import type { JSX } from 'react'
import { type CountVerdict, VERDICT_ICONS, VERDICT_LABELS } from './format.ts'

// Every rule of a trial, each verdict (icon and label) next to the verbatim text it was
// judged against. Medical terms appear only inside those quotes.

type Judged = CriterionVerdict & { verdict: CountVerdict }

function isJudged(c: CriterionVerdict): c is Judged {
  return c.verdict !== 'not_applicable'
}

function Group({ group }: { group: string | null }): JSX.Element | null {
  return group === null ? null : <p className="criterion-group">For: {group}</p>
}

function Rule({ criterion }: { criterion: Judged }): JSX.Element {
  return (
    <li className={`criterion criterion-${criterion.verdict}`}>
      <p className="criterion-verdict">
        <span className="count-icon" aria-hidden="true">
          {VERDICT_ICONS[criterion.verdict]}
        </span>
        <span>{VERDICT_LABELS[criterion.verdict]}</span>
      </p>
      <blockquote className="criterion-text">{criterion.text}</blockquote>
      <Group group={criterion.group} />
    </li>
  )
}

type RulesProps = { id: string; label: string; rules: Judged[] }

function Rules({ id, label, rules }: RulesProps): JSX.Element | null {
  if (rules.length === 0) return null
  return (
    <>
      <h4 id={id}>{label}</h4>
      <ul className="criteria" aria-labelledby={id}>
        {rules.map((c, i) => (
          <Rule key={`${i}-${c.text}`} criterion={c} />
        ))}
      </ul>
    </>
  )
}

export function Checklist({ trial }: { trial: TrialVerdictsResponse }): JSX.Element {
  if (trial.eligibility === 'unsplittable') {
    return (
      <div className="checklist">
        <p className="trial-unsplit">
          We could not turn this trial's rules into a checklist, so here they are as written. Ask
          your doctor about them.
        </p>
        <blockquote className="criterion-text criterion-raw">
          {trial.rawCriteria ?? 'ClinicalTrials.gov lists no rules for this trial.'}
        </blockquote>
      </div>
    )
  }

  const judged = trial.criteria.filter(isJudged)
  const other = trial.criteria.filter((c) => !isJudged(c))
  return (
    <div className="checklist">
      <Rules
        id={`${trial.nctId}-include`}
        label="To take part, you need"
        rules={judged.filter((c) => c.kind === 'inclusion')}
      />
      <Rules
        id={`${trial.nctId}-exclude`}
        label="You cannot take part if"
        rules={judged.filter((c) => c.kind === 'exclusion')}
      />
      {other.length > 0 && (
        <>
          <h4 id={`${trial.nctId}-other`}>Rules for other groups of patients</h4>
          <p className="criteria-note">
            These seem to be for a different group of patients, such as another cancer type, so they
            are not counted. Your doctor can confirm.
          </p>
          <ul className="criteria" aria-labelledby={`${trial.nctId}-other`}>
            {other.map((c, i) => (
              <li key={`${i}-${c.text}`} className="criterion criterion-other">
                <blockquote className="criterion-text">{c.text}</blockquote>
                <Group group={c.group} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
