import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Mermaid since it involves complex DOM rendering that jsdom might not handle perfectly
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}))
