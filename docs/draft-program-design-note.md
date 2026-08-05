# Draft-program generation mode — design note (seed, not implemented)

**Status:** design note only, no code. Written to satisfy
`BerryStudio-Upgrade-Plan-v2.md`'s WP-38, whose own acceptance criterion is
explicitly "a short design note (not code)... committed to the repo as the
seed for a real future WP" — not an implementation.

**Origin:** v1.0's own honest notes named this as a deferred stretch goal
beyond spec-first generation (WP-3, shipped): instead of an AI provider
emitting one final `PatternSpecV1` object, it would emit a **sequence of
construction operations** against the app's real associative Point/Line/
Arc/Circle system — closer to how a human patternmaker actually thinks
("place a point at bust height, draw a line to center front, offset it
2cm...") than to describing a finished shape all at once.

**Prerequisite status:** the original plan scoped this behind WP-25's
real seam-pairing data landing first (needed to validate a generated
program's output). WP-25 shipped in Phase A of this document — the
prerequisite is already satisfied. A future WP implementing this design
doesn't need to wait on anything else in this plan.

---

## 1. Design principle: automate the existing UI, don't invent a new engine

`js/canvas.js` already has a real, working associative construction
system — this is not a proposal to build parametric geometry from
scratch, it's a proposal to let an AI provider **drive the exact same
primitives a human already clicks through**:

- **Points** (`addPoint`) are named, draggable anchors. A point's X/Y can
  be a literal number or a **formula** (`p.xExpr`/`p.yExpr`), evaluated by
  the same safe, non-`eval()` expression parser (`evalExpr`/`tokenizeExpr`,
  `js/canvas.js:1337-1363`) the Variables system already uses.
- **Construction lines/arcs/circles** (`cons` entries, `kind: "line"` /
  `"arc"` / `"circle"`) reference points **by id**, not frozen coordinates
  — dragging a point reshapes everything attached to it. Arcs store a
  bulge point their curve passes through (`js/canvas.js:1475-1488`), the
  same real bezier-curve metadata `js/fancy-patterns.js`'s `princessCurve()`
  and `js/pattern-export.js`'s DXF/PDF export already understand.
- **"Create Pattern Piece"** (`finishPromotePiece`, `js/canvas.js:1494`)
  walks an ordered, closed loop of existing point ids and snapshots their
  resolved coordinates into a real, independent, gradable pattern piece —
  sampling a real curve wherever a Construction Arc connects two adjacent
  points instead of collapsing it to a straight chord.

A draft program is therefore a **sequence of calls into this existing
API**, not a new geometry representation. The AI provider's job is to
emit that sequence; the app's job (unchanged) is to execute it exactly as
if a human had clicked each step.

## 2. Operation vocabulary

A closed, fixed set of operations — deliberately NOT a general-purpose
scripting language (no loops, no conditionals, no arbitrary code). Every
operation maps directly onto a real, already-shipped `js/canvas.js`
function; this table is an interface contract, not new implementation:

| Operation | Shape | Maps onto (existing, real) |
|---|---|---|
| `defineVariable` | `{name, formula}` | `setVariable(name, formula)` — same formula language, same circular-reference/unknown-name errors surfaced today |
| `placePoint` | `{name, xExpr, yExpr}` | `addPoint()` + assigning `p.xExpr`/`p.yExpr`, resolved via `evalExpr`/`lookupCtx` exactly like a manually-typed point formula |
| `lineBetween` | `{name, fromPoint, toPoint}` | `cons.push({kind:"line", a, b})` — the exact shape `js/canvas.js:1138` already produces from a UI drag |
| `arcThrough` | `{name, fromPoint, toPoint, bulgePoint}` | `cons.push({kind:"arc", a, b, ctrl})` — `js/canvas.js:979` |
| `circleAt` | `{name, centerPoint, radiusPoint}` | `cons.push({kind:"circle", a, b})` — `js/canvas.js:990` |
| `offsetParallel` | `{name, fromLine, distanceExpr, side}` | **New primitive, not yet exposed as a construction op today.** `js/geometry.js` already offsets a whole PIECE's outline (seam allowance); offsetting a single construction *line* by a formula distance is the same math applied to one segment instead of a closed polygon — real work, but small, self-contained, and reuses `js/geometry.js`'s existing offset math rather than inventing new. |
| `intersectionPoint` | `{name, ref1, ref2}` | **New primitive — a real, disclosed gap.** Neither the interactive UI nor the construction engine currently computes where two lines/arcs cross and drops a point there, even though patternmakers do this constantly ("where the side seam meets the hem"). A future WP implementing this design needs to add real line-line/line-arc intersection math (not present in `js/geometry.js` today) before `intersectionPoint` can be more than a stub. |
| `promotePiece` | `{name, pointLoop:[ids...], nameEn, nameAr}` | `finishPromotePiece(nameEn, nameAr)` — today only reachable via the click-accumulated `pendingPromoteOutline`/`pendingPromoteIds` UI state; a draft-program executor needs a small, pure `promotePointLoop(ids, nameEn, nameAr)` variant that takes the ordered id list as a plain argument instead. Small, mechanical refactor — not a new geometry algorithm. |
| `setPieceRole` | `{piece, role}` | Assigns the same `piece.role` field WP-25's seam-pairing data and WP-24's Ease check already consume — a draft-program piece gets full-confidence Check Pattern results for free, the same way a `PATTERNS`/library-generated piece does today. |

Every operation is a **flat, schema-validatable JSON object** with a
closed `op` enum — the same "declarative, not executable" philosophy
`schema/pattern-spec.v1.json` already uses, extended from "describe the
final shape" to "describe the steps," never to "run arbitrary code."

## 3. How it validates against `js/validate.js`

No new validation design needed — this reuses a pattern that's **already
real and shipped**. `js/ai-spec-pipeline.js` already has a one-time
geometry-validation retry for traced tech-pack pieces (`js/ai-spec-pipeline.js:313-336`):
run `PatternValidator.run()` (the same 8 checks Check Pattern's UI runs —
closed outline, self-intersection, grainline, seam-allowance offset,
cut-on-fold symmetry, seam-length parity, notch alignment, ease) against
the produced piece(s); if any check reports `fail` (not `warn` — a warn is
a real, acceptable outcome the same way it is for a human-drafted piece),
send the provider one retry with the specific failure messages appended
to the prompt; a second failure falls back to today's local heuristic
path exactly like every other AI generation mode already does on
exhaustion.

A draft program plugs into this **unchanged**:

```
op sequence -> execute each op via the real canvas.js API
            -> promotePointLoop() the resulting piece(s)
            -> PatternValidator.run(pieces)
            -> fail?  one retry with failure messages, else fall back
            -> pass/warn -> accept, exactly like any other generation source
```

The op-execution step itself can also reject early and cheaply, before
ever calling `PatternValidator`: an op referencing an unknown point name,
a malformed formula (`evalExpr` already throws `"unknown name: X"` /
`"circular reference: X"` / `"unexpected token: X"` for exactly this),
or a `promotePiece` loop with fewer than 3 points is a structural error,
not a patternmaking-quality one — same two-tier validation
(structural-then-quality) `generateFromSpec()`'s schema-validate-then-
geometry-validate flow already establishes for `PatternSpecV1`.

## 4. Relationship to the Variables system

This is not a new formula language — it **is** the Variables system,
just AI-authored instead of hand-typed. `defineVariable`/`placePoint`'s
`xExpr`/`yExpr` are literally `setVariable()`/`p.xExpr` calls using the
exact same expression grammar (`+ - * / ( )`, named lookups against other
variables or the live measurement set — chest/waist/hips/shoulder/
backLen/sleeve/neck/bicep/inseam/thigh/height) a patternmaker already
types into the Variables panel today. An AI emitting
`{"op":"defineVariable","name":"waistDrop","formula":"chest/8 - 2"}`
is doing the identical thing a human does clicking "Add Variable" and
typing `chest/8 - 2` — which is the actual point of this design (closer
to how a patternmaker thinks, not a new abstraction on top of one).

A draft program's variables are session-scoped exactly like manually
authored ones today (`setVariable`/`removeVariable`/`getVariables` — no
new persistence model needed) and re-resolve automatically on grade/
resize the same way, since nothing about how a variable is *created*
changes how it's *evaluated*.

## 5. Relationship to `PatternSpecV1` (spec-first generation)

A complementary generation **mode**, not a replacement:

- `PatternSpecV1` (WP-3, shipped) is **declarative** — describe the
  finished garment (silhouette, neckline, sleeve...) and let
  `AIGen.build()` derive the geometry deterministically.
- A draft program is **procedural** — describe the construction *steps*
  and let the existing associative engine resolve the geometry as those
  steps execute, the same way it resolves a human's clicks.

Both funnel into the same two things at the end: real `js/canvas.js`
piece data, and `PatternValidator`'s same 8 checks. Neither is more
"authoritative" than the other; which mode a given generation request
uses is a provider/prompt choice, not a schema-level fork. A future WP
should NOT attempt to unify them into one schema — `PatternSpecV1`
staying purely declarative (no steps, no order-dependence) is exactly
what makes `js/validate.js`'s existing full-confidence checks possible
without needing to track construction history; that property is worth
protecting, not merging away.

## 6. Non-goals (deliberately out of scope)

- **No general-purpose scripting.** No loops, conditionals, variables-as-
  functions, or op-sequence branching. The vocabulary in §2 is meant to
  stay a small, closed, schema-enumerable set — the same reason the
  Variables formula language is a hand-rolled recursive-descent parser
  (`js/canvas.js:1337`) instead of `eval()`/`Function()`.
- **No new persistence/versioning model.** A draft program's *output* is
  a normal pattern piece set, indistinguishable from one built any other
  way once promoted — no "this piece remembers its construction history"
  feature is implied or needed.
- **No attempt to replace manual drafting.** Same framing as spec-first
  generation: a fast, editable starting point, not a claim of final,
  unchangeable authority over the pattern.

## 7. Suggested first slice for a future WP

Given `intersectionPoint` and `offsetParallel` are the two operations
above needing genuinely new geometry math (§2), and everything else is
mechanical wiring of already-shipped functions, a real follow-up WP
should likely ship in two slices:

1. `defineVariable` / `placePoint` / `lineBetween` / `arcThrough` /
   `circleAt` / `promotePiece` / `setPieceRole` — zero new geometry math,
   pure plumbing over existing `js/canvas.js` functions, plus the
   `PatternValidator` retry loop from §3. Enough to draft any
   straight/simple-curved-seam garment procedurally.
2. `offsetParallel` and `intersectionPoint` as a second pass, once the
   first slice's real op-schema and executor exist to build against —
   avoids designing the harder geometry primitives in the abstract before
   there's a real caller.
