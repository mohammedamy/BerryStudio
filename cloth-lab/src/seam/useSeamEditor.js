import { useMemo, useState } from 'react'
import { createDraftPiece, addEdge, finalizeDraftPiece, removeEdge } from '../pattern/seamAuthoring'

// `options.autoPlace` (novice-first workflow): on a FRESH session (nothing
// restored), every piece the importer could not seam automatically starts
// out "placed on the body, not sewn" (the `separate` list) instead of
// blocking simulation until the user decides for each one, and pieces whose
// join was changed by a sewn dart start out acknowledged. Both stay fully
// visible and reversible in the Sew step (see `autoPlaced`/`dartNotices`).
// A restored session always keeps exactly what the user saved.
export function useSeamEditor(rawPieces, roles, seedEdges, seedSeams, placementHints, restored, options = {}) {
  const [initial] = useState(() => {
    const drafts = rawPieces.map(rp => createDraftPiece(rp, roles[rp.id], placementHints?.[rp.id]))
    const warnings = []
    for (const e of seedEdges || []) {
      const draft = drafts.find(d => d.id === e.pieceId)
      if (draft) try { addEdge(draft, e.edgeName, e.fromIdx, e.toIdx) } catch (error) { warnings.push(error.message) }
    }
    const seams = (seedSeams || []).filter(s => [s.a, s.b].every(e => drafts.find(d => d.id === e.piece)?.edges[e.edge]))
    // Restore only against identical source geometry; the caller validates the
    // design key before supplying this state. The perimeter is validated again
    // at finalize, so malformed saved state cannot reach the GPU.
    const savedById = new Map((restored?.drafts || []).map(d => [d.id, d]))
    if (Array.isArray(restored?.drafts) && savedById.size === drafts.length && drafts.every(d => JSON.stringify(d.outline) === JSON.stringify(savedById.get(d.id)?.outline))) {
      drafts.forEach(d => { d.edges = savedById.get(d.id).edges || d.edges })
      return { drafts, seams: restored.seams || seams, warnings, separate: restored.separate || [], reviewed: restored.reviewed || [], autoPlaced: [], dartNotices: [] }
    }
    if (options.autoPlace) {
      const sewn = d => seams.some(s => (s.a.piece === d.id || s.b.piece === d.id) && (drafts.length === 1 || s.a.piece !== s.b.piece))
      const autoPlaced = drafts.filter(d => !sewn(d)).map(d => d.id)
      const dartNotices = drafts.filter(d => d.joinReview && sewn(d)).map(d => d.id)
      return { drafts, seams, warnings, separate: autoPlaced, reviewed: dartNotices, autoPlaced, dartNotices }
    }
    return { drafts, seams, warnings, separate: [], reviewed: [], autoPlaced: [], dartNotices: [] }
  })
  const [drafts, setDrafts] = useState(initial.drafts)
  const [seams, setSeams] = useState(initial.seams)
  const [separate, setSeparate] = useState(initial.separate)
  const [reviewed, setReviewed] = useState(initial.reviewed)
  const [pendingStart, setPendingStart] = useState(null)
  const [pendingEdges, setPendingEdges] = useState([])
  const [error, setError] = useState(null)
  const [revision, setRevision] = useState(0)
  const changed = () => setRevision(v => v + 1)

  function chooseEdge(pieceIdx, edgeName) {
    const edge = drafts[pieceIdx]?.edges[edgeName]
    if (!edge) return
    const selected = pendingEdges.find(e => e.pieceIdx === pieceIdx && e.edgeName === edgeName)
    if (selected?.temporary) setDrafts(ds => ds.map((d, i) => {
      if (i !== pieceIdx) return d
      const copy = { ...d, edges: { ...d.edges } }; removeEdge(copy, edgeName); return copy
    }))
    setPendingEdges(edges => selected ? edges.filter(e => e.pieceIdx !== pieceIdx || e.edgeName !== edgeName) : [...edges, { pieceIdx, edgeName, from: edge.from, to: edge.to }])
    setPendingStart(null); setError(null)
  }
  function handleVertexClick(pieceIdx, vertIdx) {
    setError(null)
    const draft = drafts[pieceIdx]
    if (!draft || !Number.isInteger(vertIdx) || vertIdx < 0 || vertIdx >= draft.outline.length) return
    if (!pendingStart || pendingStart.pieceIdx !== pieceIdx) { setPendingStart({ pieceIdx, vertIdx }); return }
    if (pendingStart.vertIdx === vertIdx) { setPendingStart(null); return }
    const from = pendingStart.vertIdx
    const existing = Object.entries(draft.edges).find(([, e]) => e.from === from && e.to === vertIdx)
    if (existing) { chooseEdge(pieceIdx, existing[0]); return }
    const edgeName = `edge_${from}_${vertIdx}`
    try {
      const copy = { ...draft, edges: { ...draft.edges } }
      addEdge(copy, edgeName, from, vertIdx)
      setDrafts(ds => ds.map((d, i) => i === pieceIdx ? copy : d))
      setPendingEdges(edges => [...edges, { pieceIdx, edgeName, from, to: vertIdx, temporary: true }])
    } catch (e) { setError(e.message) }
    setPendingStart(null)
  }
  function clearPending() {
    // Cancel really cancels: uncommitted spans must not claim the perimeter.
    setDrafts(ds => ds.map((d, i) => {
      const copy = { ...d, edges: { ...d.edges } }
      pendingEdges.filter(e => e.pieceIdx === i && e.temporary).forEach(e => removeEdge(copy, e.edgeName))
      return copy
    }))
    setPendingStart(null); setPendingEdges([]); setError(null)
  }
  function commitSeam(reverse) {
    if (pendingEdges.length < 2) return
    const [anchor, ...others] = pendingEdges
    const a = { piece: drafts[anchor.pieceIdx].id, edge: anchor.edgeName }
    const additions = others.map(e => ({ id: `${a.piece}:${a.edge}:${drafts[e.pieceIdx].id}:${e.edgeName}`, a, b: { piece: drafts[e.pieceIdx].id, edge: e.edgeName }, reverse }))
    setSeams(ss => [...ss.filter(s => !additions.some(n => n.id === s.id)), ...additions])
    setSeparate(ids => ids.filter(id => !pendingEdges.some(e => drafts[e.pieceIdx].id === id)))
    setReviewed(ids => [...new Set([...ids, ...pendingEdges.map(e => drafts[e.pieceIdx].id)])])
    setPendingEdges([]); changed()
  }
  // Direction a novice would expect: BerryStudio pieces are drawn upright,
  // so the ends that point the same way (top meets top) are paired. Matches
  // the importer's own seeds (front/back side seams: false; dart legs and a
  // sleeve's underarm tube: true). `flip` inverts it for the odd case.
  function autoReverse(a, b) {
    const va = edgeVector(drafts[a.pieceIdx], a), vb = edgeVector(drafts[b.pieceIdx], b)
    return va[0] * vb[0] + va[1] * vb[1] < 0
  }
  function sewSelected(flip = false) {
    if (pendingEdges.length < 2) return
    const [anchor, ...others] = pendingEdges
    const a = { piece: drafts[anchor.pieceIdx].id, edge: anchor.edgeName }
    const additions = others.map(e => ({ id: `${a.piece}:${a.edge}:${drafts[e.pieceIdx].id}:${e.edgeName}`, a, b: { piece: drafts[e.pieceIdx].id, edge: e.edgeName }, reverse: autoReverse(anchor, e) !== !!flip }))
    setSeams(ss => [...ss.filter(s => !additions.some(n => n.id === s.id)), ...additions])
    setSeparate(ids => ids.filter(id => !pendingEdges.some(e => drafts[e.pieceIdx].id === id)))
    setReviewed(ids => [...new Set([...ids, ...pendingEdges.map(e => drafts[e.pieceIdx].id)])])
    setPendingEdges([]); changed()
  }
  function removeSeam(id) {
    const next = seams.filter(s => s.id !== id)
    setSeams(next)
    if (options.autoPlace) {
      const removed = seams.find(s => s.id === id)
      const loose = removed ? [removed.a.piece, removed.b.piece].filter(p => !next.some(s => (s.a.piece === p || s.b.piece === p) && (drafts.length === 1 || s.a.piece !== s.b.piece))) : []
      if (loose.length) setSeparate(ids => [...new Set([...ids, ...loose])])
    }
    changed()
  }
  function toggleReverse(id) { setSeams(ss => ss.map(s => s.id === id ? { ...s, reverse: !s.reverse } : s)); changed() }
  function markSeparate(id, value) { setSeparate(ids => value ? [...new Set([...ids, id])] : ids.filter(p => p !== id)); changed() }
  const assignedByPiece = useMemo(() => drafts.map(d => {
    const set = new Set(), n = d.outline.length
    for (const edge of Object.values(d.edges)) {
      if (!Number.isInteger(edge.from) || !Number.isInteger(edge.to)) continue
      for (let j = 0; j < n; j++) { const i = (edge.from + j) % n; set.add(i); if (i === edge.to) break }
    }
    return set
  }), [drafts])
  const unjoined = drafts.filter(d => !separate.includes(d.id) && ((d.joinReview && !reviewed.includes(d.id)) || !seams.some(s => (s.a.piece === d.id || s.b.piece === d.id) && (drafts.length === 1 || s.a.piece !== s.b.piece))))
  // Contiguous runs of outline not covered by any named edge, per piece —
  // drawn as clickable "free" stretches so a novice can pick a whole side
  // with one click instead of clicking its start and end points.
  const gapsByPiece = useMemo(() => drafts.map(d => {
    const n = d.outline.length
    const covered = new Set()
    for (const edge of Object.values(d.edges)) {
      if (!Number.isInteger(edge.from) || !Number.isInteger(edge.to)) continue
      for (let j = 0; j < n; j++) { const i = (edge.from + j) % n; if (i === edge.to) break; covered.add(i) }
    }
    if (covered.size === 0) {
      // No named edge at all: offer each side between corners separately
      // (a full-perimeter edge is not a valid seam).
      return d.outline.map((_, i) => ({ from: i, to: (i + 1) % n }))
    }
    const gaps = []
    const start = [...Array(n).keys()].find(i => covered.has(i) && !covered.has((i + 1) % n))
    if (start === undefined) return gaps
    let i = (start + 1) % n, from = null
    for (let k = 0; k < n; k++, i = (i + 1) % n) {
      if (!covered.has(i)) { if (from === null) from = i }
      else if (from !== null) { gaps.push({ from, to: i }); from = null }
    }
    if (from !== null) gaps.push({ from, to: (start + 1) % n })
    return gaps
  }), [drafts])
  // Stable colour + number per seam, so both halves of a join are drawn in
  // the same colour with the same badge on the board and in the list.
  const seamMarks = useMemo(() => {
    const byEdge = {}
    seams.forEach((s, i) => {
      const mark = { n: i + 1, color: SEAM_COLORS[i % SEAM_COLORS.length], seamId: s.id }
      for (const end of [s.a, s.b]) (byEdge[`${end.piece}:${end.edge}`] ||= mark)
    })
    return byEdge
  }, [seams])
  function chooseSpan(pieceIdx, from, to) {
    setError(null)
    const draft = drafts[pieceIdx]
    if (!draft) return
    const existing = Object.entries(draft.edges).find(([, e]) => e.from === from && e.to === to)
    if (existing) { chooseEdge(pieceIdx, existing[0]); return }
    const edgeName = `edge_${from}_${to}`
    try {
      const copy = { ...draft, edges: { ...draft.edges } }
      addEdge(copy, edgeName, from, to)
      setDrafts(ds => ds.map((d, i) => i === pieceIdx ? copy : d))
      setPendingEdges(edges => [...edges, { pieceIdx, edgeName, from, to, temporary: true }])
    } catch (e) { setError(e.message) }
    setPendingStart(null)
  }
  // `ignorePending`: an unfinished selection is simply not sewn (its
  // temporary edges are plain boundary edges with no partner), so the
  // novice "Try it on" button can proceed instead of erroring.
  function finalize({ ignorePending = false } = {}) {
    try {
      if (!drafts.length) throw new Error('No cloth pieces are configured.')
      if (!ignorePending && (pendingStart || pendingEdges.length)) throw new Error('Join or clear the current selection first.')
      if (unjoined.length) throw new Error('Decide how each unjoined piece is attached, or explicitly leave it separate.')
      if (seams.some(s => ![s.a, s.b].every(e => drafts.find(d => d.id === e.piece)?.edges[e.edge]))) throw new Error('A join refers to an edge that no longer exists. Remove that join and select its edges again.')
      const pieces = drafts.map(d => finalizeDraftPiece({ ...d, edges: { ...d.edges } }))
      return { pieces, seams, sourceIds: drafts.map(d => d.sourceId) }
    } catch (e) { setError(e.message); return null }
  }
  return { drafts, pendingStart, pendingEdges, seams, separate, reviewed, acknowledgeJoins: id => setReviewed(ids => [...new Set([...ids, id])]), unjoined, error, revision, warnings: initial.warnings, assignedByPiece, gapsByPiece, seamMarks, autoPlaced: initial.autoPlaced, dartNotices: initial.dartNotices, handleVertexClick, chooseEdge, chooseSpan, clearPending, commitSeam, sewSelected, removeSeam, toggleReverse, markSeparate, finalize }
}

// Start→end vector of a (pending) edge on a draft's local outline.
function edgeVector(draft, e) {
  const p = draft?.outline?.[e.from], q = draft?.outline?.[e.to]
  if (!p || !q) return [0, 0]
  return [q[0] - p[0], q[1] - p[1]]
}

export const SEAM_COLORS = ['#ff8a5b', '#5bc0ff', '#c38bff', '#ffd15b', '#5bffa8', '#ff5bb0', '#8be0d4', '#f0a3ff', '#b5e35b', '#ffb35b']
