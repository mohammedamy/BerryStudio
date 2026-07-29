// Shared adaptive frame-budget controller (BerryStudio-Upgrade-Plan WP-7.3,
// reused by WP-9 for adaptive DPR): tracks a smoothed (EMA) per-frame cost
// and adjusts a bounded integer "quality knob" up or down with hysteresis,
// so a single slow frame doesn't cause instant thrashing and a single fast
// frame doesn't instantly max out quality. `report()` is meant to be called
// once per frame with the actual measured cost (ms) of the specific work
// this controller governs — not the whole rAF delta, which also includes
// unrelated render/scene cost and would make the knob react to noise it
// can't do anything about.
const DEFAULT_ALPHA = 0.1 // EMA smoothing — lower = slower to react, more stable

export class FrameBudgetController {
  constructor({ min, max, start, targetMs, alpha = DEFAULT_ALPHA, hysteresisFrames = 30 }) {
    this.min = min
    this.max = max
    this.value = start ?? max
    this.targetMs = targetMs
    this.alpha = alpha
    this.hysteresisFrames = hysteresisFrames
    this.emaMs = targetMs
    this.framesSinceChange = 0
  }

  // Returns the (possibly just-adjusted) current knob value.
  report(costMs) {
    this.emaMs += this.alpha * (costMs - this.emaMs)
    this.framesSinceChange++
    if (this.framesSinceChange < this.hysteresisFrames) return this.value
    // Asymmetric thresholds: react to overrun sooner (1.15x) than to
    // headroom (0.75x) — dropping quality to stay smooth matters more than
    // grabbing back quality quickly once there's room.
    if (this.emaMs > this.targetMs * 1.15 && this.value > this.min) {
      this.value--
      this.framesSinceChange = 0
    } else if (this.emaMs < this.targetMs * 0.75 && this.value < this.max) {
      this.value++
      this.framesSinceChange = 0
    }
    return this.value
  }
}
