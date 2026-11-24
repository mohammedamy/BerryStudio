import { useCallback, useEffect, useRef, useState } from 'react'

function getNativeFullscreenElement(doc) {
  return doc?.fullscreenElement || doc?.webkitFullscreenElement || null
}

function syncBodyClass(active) {
  if (typeof document === 'undefined' || !document.body) return
  document.body.classList.toggle('clothlab-fullscreen-active', !!active)
}

function notifyViewportResize() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('resize'))
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'))
    })
  }
}

export function useFullscreen(rootRef) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [stageOnly, setStageOnly] = useState(false)
  const nativeActiveRef = useRef(false)

  const enterFullscreen = useCallback(() => {
    setIsFullscreen(true)
    syncBodyClass(true)
    const el = rootRef?.current
    const req = el?.requestFullscreen || el?.webkitRequestFullscreen
    if (req) {
      try {
        const res = req.call(el)
        if (res && typeof res.catch === 'function') res.catch(() => {})
      } catch {
        // Fallback viewport-fullscreen mode stays active even if native Fullscreen API is unavailable.
      }
    }
    notifyViewportResize()
  }, [rootRef])

  const exitFullscreen = useCallback(() => {
    nativeActiveRef.current = false
    setIsFullscreen(false)
    setStageOnly(false)
    syncBodyClass(false)
    if (typeof document !== 'undefined' && getNativeFullscreenElement(document)) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen
      if (exit) {
        try {
          const res = exit.call(document)
          if (res && typeof res.catch === 'function') res.catch(() => {})
        } catch {
          // Ignore native exit rejection cleanly.
        }
      }
    }
    notifyViewportResize()
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) exitFullscreen()
    else enterFullscreen()
  }, [isFullscreen, enterFullscreen, exitFullscreen])

  const toggleStageOnly = useCallback(() => {
    setStageOnly((prev) => !prev)
    notifyViewportResize()
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    function onFullscreenChange() {
      const fsEl = getNativeFullscreenElement(document)
      const rootEl = rootRef?.current
      if (fsEl && rootEl && (fsEl === rootEl || rootEl.contains(fsEl))) {
        nativeActiveRef.current = true
        setIsFullscreen(true)
        syncBodyClass(true)
        notifyViewportResize()
      } else if (!fsEl && nativeActiveRef.current) {
        nativeActiveRef.current = false
        setIsFullscreen(false)
        setStageOnly(false)
        syncBodyClass(false)
        notifyViewportResize()
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
    }
  }, [rootRef])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    function onKeyDown(e) {
      if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault()
        e.stopPropagation()
        exitFullscreen()
        return
      }
      if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = e.target?.tagName
        const editable = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.target?.isContentEditable
        if (!editable) {
          e.preventDefault()
          toggleFullscreen()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isFullscreen, exitFullscreen, toggleFullscreen])

  useEffect(() => {
    const el = rootRef?.current
    return () => {
      syncBodyClass(false)
      if (typeof document !== 'undefined' && el && getNativeFullscreenElement(document) === el) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen
        if (exit) {
          try {
            const res = exit.call(document)
            if (res && typeof res.catch === 'function') res.catch(() => {})
          } catch {
            // Ignore cleanup rejection cleanly.
          }
        }
      }
    }
  }, [rootRef])

  return {
    isFullscreen,
    stageOnly,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
    toggleStageOnly,
  }
}
