import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getValueError } from '../src/features/tree/validation.ts'

test('NUL characters are identified in otherwise valid values', () => {
  for (const nodeValue of ['\0', '\0before', 'before\0after', 'after\0']) {
    assert.match(getValueError(nodeValue), /NUL/)
  }
})

test('value validation preserves whitespace, length, and Unicode behavior', () => {
  for (const nodeValue of ['', ' \t\n', 'x'.repeat(501)]) {
    assert.notEqual(getValueError(nodeValue), null)
  }
  for (const nodeValue of [' Kyiv ', 'Київ', '東京', 'a\tb', 'x'.repeat(500)]) {
    assert.equal(getValueError(nodeValue), null)
  }
})
