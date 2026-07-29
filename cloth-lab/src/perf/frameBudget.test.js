import { describe, it, expect } from 'vitest'
import { FrameBudgetController } from './frameBudget.js'

describe('FrameBudgetController', () => {
  it('holds its value during the hysteresis window even under sustained overrun', () => {
    const c = new FrameBudgetController({ min: 4, max: 12, start: 8, targetMs: 10, hysteresisFrames: 30 })
    for (let i = 0; i < 29; i++) c.report(30)
    expect(c.value).toBe(8)
  })

  it('steps down by exactly 1 once sustained cost exceeds the overrun threshold past hysteresis', () => {
    const c = new FrameBudgetController({ min: 4, max: 12, start: 8, targetMs: 10, hysteresisFrames: 30 })
    let v
    for (let i = 0; i < 30; i++) v = c.report(30)
    expect(v).toBe(7)
  })

  it('steps up by exactly 1 once sustained cost is well under the headroom threshold past hysteresis', () => {
    const c = new FrameBudgetController({ min: 4, max: 12, start: 8, targetMs: 10, hysteresisFrames: 30 })
    let v
    for (let i = 0; i < 30; i++) v = c.report(2)
    expect(v).toBe(9)
  })

  it('never drops below min even under indefinite overrun', () => {
    const c = new FrameBudgetController({ min: 4, max: 12, start: 5, targetMs: 10, hysteresisFrames: 5 })
    let v
    for (let i = 0; i < 200; i++) v = c.report(100)
    expect(v).toBe(4)
  })

  it('never rises above max even under indefinite headroom', () => {
    const c = new FrameBudgetController({ min: 4, max: 12, start: 11, targetMs: 10, hysteresisFrames: 5 })
    let v
    for (let i = 0; i < 200; i++) v = c.report(0.1)
    expect(v).toBe(12)
  })

  it('resets the hysteresis counter on every change, so changes are spaced apart', () => {
    const c = new FrameBudgetController({ min: 4, max: 12, start: 8, targetMs: 10, hysteresisFrames: 10 })
    for (let i = 0; i < 10; i++) c.report(30) // first drop at frame 10 (8 -> 7)
    expect(c.value).toBe(7)
    for (let i = 0; i < 9; i++) c.report(30) // not yet 10 frames since the reset
    expect(c.value).toBe(7)
    c.report(30) // 10th frame since reset -> drops again
    expect(c.value).toBe(6)
  })
})
