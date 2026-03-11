import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

describe('Smoke Test', () => {
  it('should render the app title', () => {
    render(<h1>Solution Agent</h1>)
    expect(screen.getByText(/Solution Agent/i)).toBeDefined()
  })
})
