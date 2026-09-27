import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SearchOutcome } from './api.ts'
import { App } from './App.tsx'

// The grouped profile form (F2): sections, distance quick picks, the notes counter, the
// error summary and the loading state.

function renderApp(
  search: () => Promise<SearchOutcome> = async () => ({ kind: 'unavailable' }),
): void {
  sessionStorage.clear()
  render(<App search={search} checkTrial={async () => ({ kind: 'unavailable' })} />)
}

function group(name: string): HTMLElement {
  return screen.getByRole('group', { name })
}

describe('the profile form', () => {
  it('explains the three steps before the form', () => {
    renderApp()
    const steps = within(screen.getByRole('list', { name: 'How it works' })).getAllByRole(
      'listitem',
    )

    expect(steps.map((s) => s.textContent)).toEqual([
      'Tell us about the cancer',
      'We check every rule of nearby recruiting trials',
      'Take your questions to your doctor',
    ])
  })

  it('groups the questions under plain headings', () => {
    renderApp()

    expect(within(group('About the cancer')).getByLabelText('Cancer type')).toBeInTheDocument()
    expect(within(group('About the cancer')).getByLabelText('Stage')).toBeInTheDocument()
    expect(within(group('About you')).getByLabelText('Age')).toBeInTheDocument()
    expect(within(group('About you')).getByLabelText('Sex')).toBeInTheDocument()
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
    fireEvent.change(screen.getByLabelText('Sex'), { target: { value: 'female' } })
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
