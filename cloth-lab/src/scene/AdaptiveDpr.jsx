import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { FrameBudgetController } from '../perf/frameBudget'

// WP-9.4: replaces r3f's static `dpr={[1,2]}` default with the same
// EMA/hysteresis controller WP-7.3 introduced for adaptive substepping —
// a slow device renders at a lower pixel ratio to stay smooth, a fast one
// spends the headroom on sharper output instead of sitting idle. Renders
// nothing itself; a bare logic component dropped into the Canvas tree so
// it can use useFrame/useThree like any other scene child.
//
// FrameBudgetController's `value` is an integer step count, designed for
// WP-7.3's substep range (4-12) — reused here as an INDEX into a small
// fixed DPR table rather than trying to make it emit an arbitrary
// fractional DPR directly; the discrete-level model is what it's for.
const DPR_LEVELS = [0.75, 1, 1.5, 2]
const TARGET_FRAME_MS = (1000 / 60) * 0.9 // budget the whole frame close to a 60fps slot

export default function AdaptiveDpr() {
  const setDpr = useThree((s) => s.setDpr)
  const maxLevel = useMemo(() => {
    const cap = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
    // Never target a level above what this screen's own DPR actually supports.
    for (let i = DPR_LEVELS.length - 1; i >= 0; i--) if (DPR_LEVELS[i] <= cap) return i
    return 0
  }, [])
  const controllerRef = useRef(null)
  if (!controllerRef.current) {
    controllerRef.current = new FrameBudgetController({ min: 0, max: maxLevel, start: maxLevel, targetMs: TARGET_FRAME_MS })
  }
  const lastLevelRef = useRef(maxLevel)

  useFrame((_, delta) => {
    const level = controllerRef.current.report(delta * 1000)
    if (level !== lastLevelRef.current) {
      lastLevelRef.current = level
      setDpr(DPR_LEVELS[level])
    }
  })

  return null
}
