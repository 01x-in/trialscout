import type { Profile } from '@trialscout/contract'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SearchOutcome } from './api.ts'
import { App } from './App.tsx'

// The grouped profile form (F2): sections, distance quick picks, the notes counter, the
// error summary and the loading state.

function renderApp(
  search: (profile: Profile) => Promise<SearchOutcome> = async () => ({ kind: 'unavailable' }),
): void {
  sessionStorage.clear()
  render(<App search={search} checkTrial={async () => ({ kind: 'unavailable' })} />)
}

function group(name: string): HTMLElement {
  return screen.getByRole('group', { name })
}

describe('the profile form', () => {
  // The header names the site and the landing page says what it does, so this page opens with
  // a short heading for the form.
  it('opens with one short heading, and no repeated steps', () => {
    renderApp()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Check trials near you')
    expect(screen.queryByRole('heading', { name: 'TrialScout' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'How it works' })).toBeNull()
  })

  it('has the form and the results as two labelled parts', () => {
    renderApp()
    const formPart = screen.getByRole('region', { name: 'Check trials near you' })
    const resultsPart = screen.getByRole('region', { name: 'Results' })

    expect(formPart).toContainElement(screen.getByRole('form', { name: 'Your profile' }))
    expect(resultsPart).not.toContainElement(screen.getByRole('form', { name: 'Your profile' }))
    // The form comes first, so on a phone it is above the results.
    expect(formPart.compareDocumentPosition(resultsPart) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('says where the trials will show, until a search has run', async () => {
    renderApp(async () => ({ kind: 'unavailable' }))
    const results = within(screen.getByRole('region', { name: 'Results' }))
    const hint =
      "Trials worth discussing with your doctor will show here, each rule next to the trial's own words."

    expect(results.getByText(hint)).toBeInTheDocument()
  })

  it('groups the questions under plain headings', () => {
    renderApp()

    // Headings, not <legend>s: Safari draws a legend on the card's border.
    for (const name of [
      'About the cancer',
      'About you',
      'Where you are',
      'Anything else (optional)',
    ]) {
      expect(group(name)).toContainElement(screen.getByRole('heading', { level: 2, name }))
    }

    expect(within(group('About the cancer')).getByLabelText('Cancer type')).toBeInTheDocument()
    expect(within(group('About the cancer')).getByLabelText('Stage')).toBeInTheDocument()
    expect(within(group('About you')).getByLabelText('Age')).toBeInTheDocument()
    expect(within(group('About you')).getByRole('radiogroup', { name: 'Sex' })).toBeInTheDocument()
    expect(within(group('Where you are')).getByLabelText('Country')).toBeInTheDocument()
    expect(within(group('Where you are')).getByLabelText('City')).toBeInTheDocument()
    expect(
      within(group('Where you are')).getByLabelText('How far can you travel? (km)'),
    ).toBeInTheDocument()
    expect(
      within(group('Anything else (optional)')).getByLabelText(
        'Past treatments, medicines and other conditions',
      ),
    ).toBeInTheDocument()
  })

  // Safari draws its own menus at its own height, ignoring ours; the form turns that off
  // and draws the arrow on a wrapper, so every field is the same height in every browser.
  it('wraps each drop-down menu to draw its own arrow', () => {
    renderApp()

    expect(screen.getByLabelText('Stage').parentElement).toHaveClass('select')
  })

  it('asks for sex with three radio buttons, all in view, none chosen at first', () => {
    renderApp()
    const sex = screen.getByRole('radiogroup', { name: 'Sex' })
    const radios = within(sex).getAllByRole('radio') as HTMLInputElement[]

    expect(radios.map((r) => r.getAttribute('value'))).toEqual(['female', 'male', 'other'])
    expect(radios.map((r) => r.labels?.[0]?.textContent)).toEqual(['Female', 'Male', 'Other'])
    expect(radios.some((r) => r.checked)).toBe(false)

    fireEvent.click(within(sex).getByLabelText('Other'))
    expect(radios.map((r) => r.checked)).toEqual([false, false, true])
  })

  it('ties the missing-sex message to the radio group, and links to the first choice', () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Find trials' }))

    const sex = screen.getByRole('radiogroup', { name: 'Sex' })
    expect(sex).toHaveAttribute('aria-describedby', 'sex-error')
    expect(screen.getByText('Choose female, male or other.')).toHaveAttribute('id', 'sex-error')
    for (const radio of within(sex).getAllByRole('radio')) {
      expect(radio).toHaveAttribute('aria-invalid', 'true')
    }
    expect(document.getElementById('sex')).toBe(within(sex).getByLabelText('Female'))
  })

  it('fills the distance from a quick pick, and shows which one is chosen', () => {
    renderApp()
    const picks = within(group('Distance quick picks'))
    const distance = screen.getByLabelText<HTMLInputElement>('How far can you travel? (km)')

    fireEvent.click(picks.getByRole('button', { name: '300 km' }))

    expect(distance.value).toBe('300')
    expect(picks.getByRole('button', { name: '300 km' })).toHaveAttribute('aria-pressed', 'true')
    expect(picks.getByRole('button', { name: '50 km' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.change(distance, { target: { value: '120' } })
    for (const pick of picks.getAllByRole('button')) {
      expect(pick).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('shows the quick picks as plain text buttons after "Or choose:"', () => {
    renderApp()
    const picks = group('Distance quick picks')

    expect(picks).toHaveTextContent(/^Or choose:/)
    for (const pick of within(picks).getAllByRole('button')) expect(pick).toHaveClass('text-pick')
  })

  it('offers "Any distance", for a patient who can travel anywhere', () => {
    renderApp()
    const picks = within(group('Distance quick picks'))

    expect(picks.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '50 km',
      '100 km',
      '300 km',
      '1,000 km',
      'Any distance',
    ])
    fireEvent.click(picks.getByRole('button', { name: 'Any distance' }))

    // The field says "Any distance"; the search gets 20,000 km (see the next test).
    expect(screen.getByLabelText<HTMLInputElement>('How far can you travel? (km)').value).toBe(
      'Any distance',
    )
    expect(picks.getByRole('button', { name: 'Any distance' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('selects "Any distance" when 20000 is typed, since that is the same search', () => {
    renderApp()
    const picks = within(group('Distance quick picks'))

    fireEvent.change(screen.getByLabelText('How far can you travel? (km)'), {
      target: { value: '20000' },
    })

    expect(picks.getByRole('button', { name: 'Any distance' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(picks.getByRole('button', { name: '1,000 km' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('searches 20,000 km, the furthest a search reaches, for "Any distance"', async () => {
    const searched: number[] = []
    renderApp(async (profile) => {
      searched.push(profile.maxDistanceKm)
      return { kind: 'unavailable' }
    })
    fireEvent.change(screen.getByLabelText('Cancer type'), { target: { value: 'lung cancer' } })
    fireEvent.change(screen.getByLabelText('Stage'), { target: { value: 'IV' } })
    fireEvent.change(screen.getByLabelText('Age'), { target: { value: '58' } })
    fireEvent.click(screen.getByLabelText('Female'))
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'India' } })
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Pune' } })
    fireEvent.click(screen.getByRole('button', { name: 'Any distance' }))

    fireEvent.click(screen.getByRole('button', { name: 'Find trials' }))

    await screen.findByText(/could not check trials right now/)
    expect(searched).toEqual([20000])
  })

  it('shows "Any distance" again for a saved search at 20,000 km', () => {
    sessionStorage.setItem(
      'trialscout.profile',
      JSON.stringify({
        cancerType: 'lung cancer',
        stage: 'IV',
        age: 58,
        sex: 'female',
        country: 'India',
        city: 'Pune',
        maxDistanceKm: 20000,
      }),
    )
    render(
      <App
        search={async () => ({ kind: 'unavailable' })}
        checkTrial={async () => ({ kind: 'unavailable' })}
      />,
    )

    expect(screen.getByLabelText<HTMLInputElement>('How far can you travel? (km)').value).toBe(
      'Any distance',
    )
    expect(screen.getByRole('button', { name: 'Any distance' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('never submits the form from a quick pick', () => {
    let searches = 0
    renderApp(async () => {
      searches += 1
      return { kind: 'unavailable' }
    })

    fireEvent.click(within(group('Distance quick picks')).getByRole('button', { name: '100 km' }))

    expect(searches).toBe(0)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says the notes stay in the tab, and counts their characters', () => {
    renderApp()
    const notes = screen.getByLabelText('Past treatments, medicines and other conditions')

    expect(screen.getByText("Stays in this browser tab. We don't store it.")).toBeInTheDocument()
    expect(screen.getByText('0 of 4,000 characters')).toBeInTheDocument()

    fireEvent.change(notes, { target: { value: 'Took osimertinib.' } })

    expect(screen.getByText('17 of 4,000 characters')).toBeInTheDocument()
    expect(notes.getAttribute('aria-describedby')).toContain('notes-count')
  })

  it('says plainly, before the search, that the answers are not stored', () => {
    renderApp()
    const note = screen.getByRole('note', { name: 'Your privacy' })

    expect(note).toHaveTextContent(
      "We don't store your answers. They stay in this browser tab. Each check sends them to our server, which uses them and then throws them away. No accounts, no tracking.",
    )
    expect(within(note).getByRole('link', { name: 'How we handle your answers' })).toHaveAttribute(
      'href',
      '/about#about-privacy',
    )
  })

  it('lists the answers to fix, linked to each field, and moves focus to the first', () => {
    renderApp()
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'India' } })

    fireEvent.click(screen.getByRole('button', { name: 'Find trials' }))

    const summary = screen.getByRole('alert')
    const links = within(summary).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Cancer type', '#cancerType'],
      ['Stage', '#stage'],
      ['Age', '#age'],
      ['Sex', '#sex'],
      ['City', '#city'],
      ['How far can you travel? (km)', '#maxDistanceKm'],
    ])
    expect(document.activeElement).toBe(screen.getByLabelText('Cancer type'))
  })

  it('moves focus to the results heading when the results arrive', async () => {
    sessionStorage.setItem(
      'trialscout.profile',
      JSON.stringify({
        cancerType: 'lung cancer',
        stage: 'IV',
        age: 58,
        sex: 'female',
        country: 'India',
        city: 'Pune',
        maxDistanceKm: 300,
      }),
    )
    render(
      <App
        search={async () => ({
          kind: 'results',
          response: {
            location: { city: 'Pune', countryCode: 'IN' },
            results: [],
            empty: { reason: 'none_nearby', relax: 'distance' },
            checked: { questions: 0, requests: 0, cacheHits: 0, model: null },
            source: 'live',
            dataAsOf: Date.UTC(2026, 8, 27),
            listed: { total: 0, read: 0 },
          },
        })}
        checkTrial={async () => ({ kind: 'unavailable' })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Find trials' }))

    const heading = await screen.findByRole('heading', { level: 2, name: 'No trials to show' })
    expect(document.activeElement).toBe(heading)
  })

  it('shows placeholder trial cards while it searches, hidden from screen readers', async () => {
    let finish: (outcome: SearchOutcome) => void = () => {}
    renderApp(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    fireEvent.change(screen.getByLabelText('Cancer type'), { target: { value: 'lung cancer' } })
    fireEvent.change(screen.getByLabelText('Stage'), { target: { value: 'IV' } })
    fireEvent.change(screen.getByLabelText('Age'), { target: { value: '58' } })
    fireEvent.click(screen.getByLabelText('Female'))
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'India' } })
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Pune' } })
    fireEvent.change(screen.getByLabelText('How far can you travel? (km)'), {
      target: { value: '300' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Find trials' }))

    const placeholders = document.querySelector('.skeleton-list')
    expect(placeholders).toHaveAttribute('aria-hidden', 'true')
    expect(placeholders?.querySelectorAll('.skeleton-card')).toHaveLength(3)
    finish({ kind: 'unavailable' })
    expect(await screen.findByText(/could not check trials right now/)).toBeInTheDocument()
    expect(document.querySelector('.skeleton-list')).toBeNull()
  })
})
