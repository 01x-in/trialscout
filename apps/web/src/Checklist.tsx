import type { CriterionVerdict, TrialVerdictsResponse } from '@trialscout/contract'
import { type JSX, useState } from 'react'
import { type CountVerdict, VERDICT_ICONS, VERDICT_LABELS } from './format.ts'
import { doctorQuestion } from './questions.ts'

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
        {criterion.confidence !== null && (
          <span className="criterion-confidence">
            AI confidence {Math.round(criterion.confidence * 100)}%
          </span>
        )}
      </p>
      <blockquote className="criterion-text">{criterion.text}</blockquote>
      <Group group={criterion.group} />
      {criterion.verdict === 'ask_your_doctor' && (
        <p className="criterion-question">
          <strong>To ask:</strong> {doctorQuestion(criterion)}
        </p>
      )}
    </li>
  )
}

// Filters, in the order a patient needs them: what to ask about, what may keep them out.
type Filter = 'all' | CountVerdict

const FILTERS: { filter: CountVerdict; label: string }[] = [
  { filter: 'ask_your_doctor', label: 'Ask your doctor' },
  { filter: 'likely_fails', label: 'Likely fails' },
  { filter: 'likely_meets', label: 'Likely meets' },
  { filter: 'not_checked', label: 'Not checked yet' },
]

type RulesProps = { id: string; label: string; rules: Judged[]; filter: Filter }

// One list of rules. Under a filter, a list with nothing left says so rather than vanishing,
// so the patient knows it was checked.
function Rules({ id, label, rules, filter }: RulesProps): JSX.Element | null {
  if (rules.length === 0) return null
  const shown = filter === 'all' ? rules : rules.filter((c) => c.verdict === filter)
  return (
    <>
      <h4>
        <span id={id}>{label}</span> <span className="rule-count">({rules.length})</span>
      </h4>
      {shown.length === 0 ? (
        <p className="criteria-empty">None of these rules.</p>
      ) : (
        <ul className="criteria" aria-labelledby={id}>
          {shown.map((c, i) => (
            <Rule key={`${i}-${c.text}`} criterion={c} />
          ))}
        </ul>
      )}
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

  return <Checked trial={trial} />
}

function Checked({ trial }: { trial: TrialVerdictsResponse }): JSX.Element {
  const [filter, setFilter] = useState<Filter>('all')
  const judged = trial.criteria.filter(isJudged)
  const other = trial.criteria.filter((c) => !isJudged(c))
  const count = (verdict: CountVerdict): number =>
    judged.filter((c) => c.verdict === verdict).length
  const found = FILTERS.filter((f) => count(f.filter) > 0)
  const chips: { filter: Filter; label: string; n: number }[] = [
    { filter: 'all', label: 'All', n: judged.length },
    ...found.map((f) => ({ filter: f.filter, label: f.label, n: count(f.filter) })),
  ]

  return (
    <div className="checklist">
      {/* Filters only help when the rules have more than one verdict. */}
      {found.length > 1 && (
        <>
          <div role="group" aria-label="Show rules" className="chips checklist-filters">
            {chips.map((chip) => (
              <button
                key={chip.filter}
                type="button"
                className="chip"
                aria-pressed={filter === chip.filter}
                onClick={() => setFilter(chip.filter)}
              >
                {chip.label} ({chip.n})
              </button>
            ))}
          </div>
          <p role="status" className="filter-status">
            {filter === 'all' ? '' : `Showing ${count(filter)} of ${judged.length} rules.`}
          </p>
        </>
      )}
      <Rules
        id={`${trial.nctId}-include`}
        label="To take part, you need"
        rules={judged.filter((c) => c.kind === 'inclusion')}
        filter={filter}
      />
      <Rules
        id={`${trial.nctId}-exclude`}
        label="You cannot take part if"
        rules={judged.filter((c) => c.kind === 'exclusion')}
        filter={filter}
      />
      {filter === 'all' && other.length > 0 && (
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
