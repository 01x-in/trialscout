// Deterministic criteria splitter: breaks a ClinicalTrials.gov eligibility section into
// individual inclusion and exclusion criteria. No AI: Jev is the only AI component, and the
// split is cached per trial version for all users.
//
// It errs towards keeping text together. Nested items stay with their parent, and
// inclusion items joined by "or" stay together, because splitting alternatives into
// separate required criteria would produce false "likely fails", the worst failure mode.
// Text it cannot classify is not split at all; the app then shows it raw with
// "ask your doctor".

export type CriterionKind = 'inclusion' | 'exclusion'

export type Criterion = {
  kind: CriterionKind
  // Verbatim from the source (markdown escapes and list markers removed); nested items keep
  // their own markers, one per line.
  text: string
  // The cohort or group label the criterion sits under, e.g. "Main study cohort".
  group: string | null
}

export type SplitFailure = 'empty' | 'no_sections' | 'no_criteria' | 'too_many'

export type Split = { ok: true; criteria: Criterion[] } | { ok: false; reason: SplitFailure }

// More than this is almost certainly a mis-split; the raw text is safer.
const MAX_CRITERIA = 200

const BULLET =
  /^([*•+-]|\d{1,3}[.)]|[a-z][.)]|\((?:[a-z]|\d{1,3}|[ivx]{1,4})\)|[ivx]{1,4}[.)])\s+(.*)$/i
const OR_ENDING = /\bor\s*[.;:,]?$/i

type Line = { indent: number; text: string; blankBefore: boolean }
type Item = { kind: CriterionKind; group: string | null; indent: number; lines: string[] }

function normalise(text: string): Line[] {
  const lines: Line[] = []
  let blankBefore = false
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const expanded = raw.replace(/\t/g, '    ').replace(/\\([!-/:-@[-`{-~])/g, '$1')
    const content = expanded.trim()
    if (content === '') {
      blankBefore = true
      continue
    }
    lines.push({
      indent: expanded.length - expanded.trimStart().length,
      text: content,
      blankBefore,
    })
    blankBefore = false
  }
  return lines
}

function unbold(text: string): string {
  return text
    .replace(/[*_]{2,}/g, '')
    .replace(/^#+\s*/, '')
    .trim()
}

type Heading = { kind: CriterionKind; group: string | null; rest: string | null }

function heading(text: string): Heading | null {
  const t = unbold(text)
  if (t.length > 150 || t.endsWith('.')) return null
  const inclusion =
    /\binclusion\s+criteria\b/i.test(t) ||
    /\beligible to be included\b/i.test(t) ||
    /^inclusions?\s*:?$/i.test(t)
  const exclusion =
    /\bexclusion\s+criteria\b/i.test(t) ||
    /\bexcluded from\b/i.test(t) ||
    /^exclusions?\s*:?$/i.test(t)
  const mentionsBoth = /\binclusion\b/i.test(t) && /\bexclusion\b/i.test(t)
  if (inclusion === exclusion || mentionsBoth) return null
  const kind: CriterionKind = inclusion ? 'inclusion' : 'exclusion'

  // "Inclusion Criteria: Age 18 or over" carries a criterion on the heading line.
  const inline = /^(?:key\s+|main\s+)?(?:inclusion|exclusion)\s+criteria\s*:\s*(\S.*)$/i.exec(t)
  if (inline?.[1]) return { kind, group: null, rest: inline[1] }
  // "Inclusion Criteria- All Cohorts" or "Exclusion Criteria for Part B:" names a group.
  const named = /criteria\s*(?:[-–—]|\bfor\b)\s*(.+?)\s*:?$/i.exec(t)
  return { kind, group: named?.[1] ?? null, rest: null }
}

function joinAlternatives(items: Item[]): Item[] {
  const joined: Item[] = []
  for (const item of items) {
    const previous = joined[joined.length - 1]
    const last = previous?.lines[previous.lines.length - 1] ?? ''
    if (
      previous !== undefined &&
      previous.kind === 'inclusion' &&
      item.kind === 'inclusion' &&
      previous.group === item.group &&
      OR_ENDING.test(last)
    ) {
      previous.lines.push(...item.lines)
    } else {
      joined.push({ ...item, lines: [...item.lines] })
    }
  }
  return joined
}

/** The individual criteria of an eligibility section, or why it could not be split. */
export function splitCriteria(text: string | null): Split {
  if (text === null || text.trim() === '') return { ok: false, reason: 'empty' }

  const items: Item[] = []
  let kind: CriterionKind | null = null
  let group: string | null = null
  let current: Item | null = null
  const close = (): void => {
    if (current !== null) items.push(current)
    current = null
  }

  for (const line of normalise(text)) {
    const bullet = BULLET.exec(line.text)
    const found = heading(bullet ? (bullet[2] ?? '') : line.text)
    // A bulleted line is a heading only when it is nothing but the heading.
    if (found !== null && (bullet === null || found.rest === null)) {
      close()
      kind = found.kind
      group = found.group
      if (found.rest !== null) current = { kind, group, indent: line.indent, lines: [found.rest] }
      continue
    }
    if (kind === null) continue // Preamble before the first heading.

    const open: Item | null = current
    if (bullet !== null) {
      if (open !== null && line.indent > open.indent) {
        open.lines.push(line.text) // A nested item: kept with its parent, marker and all.
      } else {
        close()
        current = { kind, group, indent: line.indent, lines: [bullet[2] ?? ''] }
      }
      continue
    }

    const label = line.text.endsWith(':') && line.text.length <= 100 && line.indent === 0
    if (label && (open === null || line.blankBefore)) {
      close()
      group = unbold(line.text).replace(/:$/, '').trim()
    } else if (
      open !== null &&
      (!line.blankBefore || line.indent > open.indent || open.lines.at(-1)?.endsWith(':'))
    ) {
      // A wrapped or indented continuation, or text the item introduced with a colon.
      open.lines.push(line.text)
    } else {
      close() // A paragraph of its own.
      current = { kind, group, indent: line.indent, lines: [line.text] }
    }
  }
  close()

  if (kind === null) return { ok: false, reason: 'no_sections' }
  const criteria = joinAlternatives(items)
    .map((item) => ({ kind: item.kind, text: item.lines.join('\n').trim(), group: item.group }))
    .filter((c) => c.text !== '')
  if (criteria.length === 0) return { ok: false, reason: 'no_criteria' }
  if (criteria.length > MAX_CRITERIA) return { ok: false, reason: 'too_many' }
  return { ok: true, criteria }
}
