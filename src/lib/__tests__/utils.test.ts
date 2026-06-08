import { describe, it, expect } from 'vitest'
import { parseJsonArray } from '../utils'

describe('parseJsonArray', () => {
  it('parses valid JSON array', () => {
    expect(parseJsonArray('["a","b"]')).toEqual(['a', 'b'])
  })

  it('returns fallback for null', () => {
    expect(parseJsonArray(null)).toEqual([])
  })

  it('returns fallback for undefined', () => {
    expect(parseJsonArray(undefined)).toEqual([])
  })

  it('returns fallback for invalid JSON', () => {
    expect(parseJsonArray('not json')).toEqual([])
  })

  it('returns fallback for non-array JSON', () => {
    expect(parseJsonArray('"string"')).toEqual([])
  })
})
