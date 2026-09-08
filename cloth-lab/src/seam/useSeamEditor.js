import { useMemo, useState } from 'react'
import { createDraftPiece, addEdge, finalizeDraftPiece, removeEdge } from '../pattern/seamAuthoring'

export function useSeamEditor(rawPieces, roles, seedEdges, seedSeams, placementHints, restored) {
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
      return { drafts, seams: restored.seams || seams, warnings, separate: restored.separate || [], reviewed: restored.reviewed || [] }
    }
    return { drafts, seams, warnings, separate: [], reviewed: [] }
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
  function removeSeam(id) { setSeams(ss => ss.filter(s => s.id !== id)); changed() }
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
  function finalize() {
    try {
      if (!drafts.length) throw new Error('No cloth pieces are configured.')
      if (pendingStart || pendingEdges.length) throw new Error('Join or clear the current selection first.')
      if (unjoined.length) throw new Error('Decide how each unjoined piece is attached, or explicitly leave it separate.')
      if (seams.some(s => ![s.a, s.b].every(e => drafts.find(d => d.id === e.piece)?.edges[e.edge]))) throw new Error('A join refers to an edge that no longer exists. Remove that join and select its edges again.')
      const pieces = drafts.map(d => finalizeDraftPiece({ ...d, edges: { ...d.edges } }))
      return { pieces, seams, sourceIds: drafts.map(d => d.sourceId) }
    } catch (e) { setError(e.message); return null }
  }
  return { drafts, pendingStart, pendingEdges, seams, separate, reviewed, acknowledgeJoins: id => setReviewed(ids => [...new Set([...ids, id])]), unjoined, error, revision, warnings: initial.warnings, assignedByPiece, handleVertexClick, chooseEdge, clearPending, commitSeam, removeSeam, toggleReverse, markSeparate, finalize }
}
