import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup()
  // The web Worker's tests run in node, which has no sessionStorage.
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear()
})
