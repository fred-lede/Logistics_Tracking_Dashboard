import { describe, expect, it } from 'vitest'
import { parseJsonArray, parseJsonObject, stringifyJson } from '../json'

describe('database JSON helpers', () => {
  it('parses arrays and falls back for invalid values', () => {
    expect(parseJsonArray<string>('["a","b"]')).toEqual(['a', 'b'])
    expect(parseJsonArray<string>('not json')).toEqual([])
    expect(parseJsonArray<string>('{"a":1}')).toEqual([])
    expect(parseJsonArray<string>(null, ['x'])).toEqual(['x'])
  })

  it('parses objects and falls back for invalid values', () => {
    expect(parseJsonObject('{"mode":"webhook"}')).toEqual({ mode: 'webhook' })
    expect(parseJsonObject('not json')).toEqual({})
    expect(parseJsonObject('["x"]')).toEqual({})
    expect(parseJsonObject(null, { enabled: true })).toEqual({ enabled: true })
  })

  it('stringifies database JSON values with explicit fallback text', () => {
    expect(stringifyJson(['a'])).toBe('["a"]')
    expect(stringifyJson(undefined, '{}')).toBe('{}')
    expect(stringifyJson(null, '[]')).toBe('[]')
  })
})
