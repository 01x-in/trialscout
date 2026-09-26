import { type JSX, useState } from 'react'
import { DemoCaution } from './DemoCaution.tsx'
import { ProfileForm } from './ProfileForm.tsx'
import { loadProfile } from './profile.ts'

export function App(): JSX.Element {
  const [initial] = useState(loadProfile)
  const [saved, setSaved] = useState(false)

  return (
    <>
      <DemoCaution />
      <main className="page">
        <h1>TrialScout</h1>
        <p className="lede">
          Tell us about your cancer, and see recruiting trials worth discussing with your doctor.
        </p>
        <ProfileForm initial={initial} onSaved={() => setSaved(true)} />
        <p role="status" className="status">
          {saved ? 'Profile saved in this browser tab.' : ''}
        </p>
      </main>
    </>
  )
}
