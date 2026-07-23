import { useMemo, useState } from 'react'
import { createDraftPiece, addEdge, finalizeDraftPiece } from '../pattern/seamAuthoring'

let edgeCounter = 0

// All interactive seam-authoring state and logic in one hook, shared between
// the 3D visual (SeamEditorScene — clickable vertices) and the HTML panel
// (SeamEditorPanel — seam list, commit/finalize buttons) via a common parent,
// the same way `dragging` state is lifted for ClothMesh/OrbitControls.
export function useSeamEditor(rawPieces, roles) {
  const [drafts, setDrafts] = useState(() => rawPieces.map((rp) => createDraftPiece(rp, roles[rp.id])))
  const [pendingStart, setPendingStart] = useState(null) // {pieceIdx, vertIdx}
  const [pendingEdges, setPendingEdges] = useState([]) // up to 2: {pieceIdx, edgeName, from, to}
  const [seams, setSeams] = useState([])
  const [error, setError] = useState(null)

  const touchDrafts = () => setDrafts((d) => d.slice())

  function handleVertexClick(pieceIdx, vertIdx) {
    setError(null)
    if (!pendingStart || pendingStart.pieceIdx !== pieceIdx) {
      setPendingStart({ pieceIdx, vertIdx })
      return
    }
    if (pendingStart.vertIdx === vertIdx) {
      setPendingStart(null) // clicked the same point twice — cancel
      return
    }
    const draft = drafts[pieceIdx]
    const edgeName = `edge${++edgeCounter}`
    try {
      addEdge(draft, edgeName, pendingStart.vertIdx, vertIdx)
    } catch (e) {
      setError(e.message)
      setPendingStart(null)
      return
    }
    touchDrafts()
    setPendingStart(null)
    setPendingEdges((pe) => [...pe, { pieceIdx, edgeName, from: pendingStart.vertIdx, to: vertIdx }].slice(-2))
  }

  function clearPending() {
    setPendingStart(null)
    setPendingEdges([])
  }

  function commitSeam(reverse) {
    if (pendingEdges.length !== 2) return
    const [a, b] = pendingEdges
    setSeams((s) => [...s, {
      id: `seam${s.length + 1}_${Date.now() % 100000}`,
      a: { piece: drafts[a.pieceIdx].id, edge: a.edgeName },
      b: { piece: drafts[b.pieceIdx].id, edge: b.edgeName },
      reverse,
    }])
    setPendingEdges([])
  }

  function removeSeam(id) {
    setSeams((s) => s.filter((sm) => sm.id !== id))
  }

  function toggleReverse(id) {
    setSeams((s) => s.map((sm) => (sm.id === id ? { ...sm, reverse: !sm.reverse } : sm)))
  }

  // Which outline indices already belong to a defined edge, per piece —
  // drives vertex color in the 3D view (assigned vs still-free).
  const assignedByPiece = useMemo(() => {
    return drafts.map((draft) => {
      const n = draft.outline.length
      const assigned = new Set()
      for (const { from, to } of Object.values(draft.edges)) {
        let i = from
        while (true) {
          assigned.add(i)
          if (i === to) break
          i = (i + 1) % n
        }
      }
      return assigned
    })
  }, [drafts])

  function finalize() {
    try {
      const finalPieces = drafts.map((d) => finalizeDraftPiece({ id: d.id, role: d.role, outline: d.outline, edges: { ...d.edges } }))
      return { pieces: finalPieces, seams }
    } catch (e) {
      setError(e.message)
      return null
    }
  }

  return {
    drafts, pendingStart, pendingEdges, seams, error, assignedByPiece,
    handleVertexClick, clearPending, commitSeam, removeSeam, toggleReverse, finalize,
  }
}
