import { expect, test } from 'vitest'
import { convertAppPattern } from './importFromApp'

function seams(aReverse, bReverse, bilateral = false) {
  return convertAppPattern({ pieces: ['a', 'b'].map((id, i) => ({
    id, label: { en: id }, role: 'waistband', bilateral,
    outline: [[0, 0], [10, 0], [10, 4], [0, 4]],
    edges: [{ fromIdx: 0, toIdx: 1, seamId: 'join', reverse: i ? bReverse : aReverse }],
  })) }).seamInstructions
}

test('declared seams retain reversed matching when no direction is specified', () => {
  expect(seams(undefined, undefined).map(s => s.reverse)).toEqual([true])
})

test('either contributor can request same-direction endpoint matching', () => {
  expect(seams(false, undefined).map(s => s.reverse)).toEqual([false])
  expect(seams(undefined, false).map(s => s.reverse)).toEqual([false])
  expect(seams(false, false).map(s => s.reverse)).toEqual([false])
})

test('bilateral copies retain explicit matching direction on both sides', () => {
  expect(seams(false, undefined, true).map(s => s.reverse)).toEqual([false, false])
})

test('conflicting directions leave the join for manual review', () => {
  expect(seams(true, false)).toEqual([])
  expect(seams(false, true, true)).toEqual([])
})

test('non-boolean directions do not override the default', () => {
  expect(seams('false', 0).map(s => s.reverse)).toEqual([true])
})
