import { finalizePiece } from './piece.js'

// Interactive counterpart to tshirt.js's hand-authored buildPiece(): the
// existing 2D pattern system has no seam/edge concept at all (confirmed by
// direct search — see the cloth-lab import research notes), so for an
// IMPORTED raw {id, label, outline} piece, edges get defined incrementally
// from user clicks instead of being known up front. A "draft piece" is the
// in-progress state; `finalizeDraftPiece` produces the same
// {id, role, outline, seamEdges, edgeOrder} shape tshirt.js's pieces have,
// so the rest of the pipeline (triangulate/assemble/simulate) never needs to
// know whether a piece was hand-authored or interactively authored.
export function createDraftPiece(rawPiece, role) {
  return { id: rawPiece.id, label: rawPiece.label, role, outline: rawPiece.outline, edges: {} }
}

function edgeIndices(from, to, n) {
  const idxs = []
  let i = from
  while (true) {
    idxs.push(i)
    if (i === to) break
    i = (i + 1) % n
  }
  return idxs
}

// Named edge spanning [fromIdx, toIdx], walking forward (wrapping past the
// end if needed) — same {from,to} convention as tshirt.js. Throws on a
// self-loop or on overlapping an existing edge's INTERIOR (sharing just an
// endpoint/corner with a neighboring edge is normal and expected).
export function addEdge(draft, name, fromIdx, toIdx) {
  const n = draft.outline.length
  if (fromIdx === toIdx) throw new Error(`"${name}": start and end are the same point — an edge needs at least 2 points`)
  const newIdxs = edgeIndices(fromIdx, toIdx, n)
  for (const [existingName, e] of Object.entries(draft.edges)) {
    const existingIdxs = new Set(edgeIndices(e.from, e.to, n))
    for (const idx of newIdxs) {
      const isSharedEndpoint = idx === e.from || idx === e.to
      if (existingIdxs.has(idx) && !isSharedEndpoint) {
        throw new Error(`"${name}" overlaps existing edge "${existingName}" at point ${idx}`)
      }
    }
  }
  draft.edges = { ...draft.edges, [name]: { from: fromIdx, to: toIdx } }
}

export function removeEdge(draft, name) {
  const next = { ...draft.edges }
  delete next[name]
  draft.edges = next
}

let freeEdgeCounter = 0

// Any perimeter the user never explicitly named becomes an anonymous "free"
// edge (matching the T-shirt's own neckline/hem — a seam pairing is only
// ever needed for edges that actually sew to something) so finalizePiece's
// full-perimeter-coverage check still passes without forcing the user to
// tediously name every last uninteresting span themselves.
export function finalizeDraftPiece(draft) {
  const n = draft.outline.length
  const edges = { ...draft.edges }
  const names = Object.keys(edges)
  if (names.length === 0) {
    edges[`free${++freeEdgeCounter}`] = { from: 0, to: 0 } // whole perimeter, one edge
  } else {
    const sorted = names.slice().sort((a, b) => edges[a].from - edges[b].from)
    for (let i = 0; i < sorted.length; i++) {
      const cur = edges[sorted[i]]
      const next = edges[sorted[(i + 1) % sorted.length]]
      if (cur.to !== next.from) {
        edges[`free${++freeEdgeCounter}`] = { from: cur.to, to: next.from }
      }
    }
  }
  return finalizePiece(draft.id, draft.role, draft.outline, edges)
}
