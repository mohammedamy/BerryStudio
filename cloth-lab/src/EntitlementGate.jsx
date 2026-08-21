import { useEffect, useState } from 'react'
import { checkEntitlement, isAllowed } from './entitlement.js'

// BerryStudio-Upgrade-Plan-v3.2 WP-42 Stage B — used by the STANDALONE
// build only (main.jsx). NOT used by embed.js: the embedded engine has no
// direct URL of its own — js/app.js's loadClothLab() already gates the one
// call site that mounts it, so a second, redundant Supabase round trip
// here would just add latency for no real coverage gain. See this file's
// sibling entitlement.js for the full reasoning.
//
// Renders App.jsx itself via a DYNAMIC import, done only after the
// entitlement check resolves — deliberately not `<EntitlementGate><App/>
// </EntitlementGate>` (a static `import App from './App.jsx'` at the top
// of main.jsx, gated only at the render/mount step). Caught live, in dev,
// during this WP's own verification: a static import still pulls in
// App.jsx's ENTIRE module graph — three.js, @react-three/fiber, every
// cloth/body/GPU module — at page-load time regardless of what React
// later decides to render, because ES module top-level evaluation runs
// on import, not on mount. That would ship (and in production, execute
// the top-level code of) the bulk of a 1.4MB bundle to a gated user before
// the check even resolves. Deferring the import itself, not just the
// mount, is what actually makes "the GPU work never starts while gated"
// true here too — the same guarantee js/app.js's loadClothLab() already
// gives the root app's two entry points.
//
// English-only, deliberately — this is a defense-in-depth screen for a
// direct-URL/bookmark access path, not the primary user-facing gate (the
// root app's own bilingual UI, js/app.js). cloth-lab's own i18n.js has no
// language to pick from until a `pattern` bridge payload arrives, which
// never happens on this gated path — see that file's own header comment.
export default function EntitlementGate() {
  const [state, setState] = useState({ phase: 'checking', signedIn: false, App: null })

  useEffect(() => {
    let cancelled = false
    checkEntitlement().then((result) => {
      if (cancelled) return
      if (isAllowed(result.entitlement)) {
        // Only reached once entitled — this is the line that actually
        // triggers fetching (and, in prod, executing) App.jsx's module
        // graph, not the top of this file.
        import('./App.jsx').then((mod) => {
          if (!cancelled) setState({ phase: 'allowed', signedIn: true, App: mod.default })
        })
      } else {
        setState({ phase: 'gated', signedIn: result.signedIn, App: null })
      }
    })
    return () => { cancelled = true }
  }, [])

  if (state.phase === 'checking') {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>Loading…</div>
      </div>
    )
  }

  if (state.phase === 'allowed') {
    const App = state.App
    return <App />
  }

  // A plain relative href, resolved by the BROWSER against the current
  // page URL (not import.meta.url, which would resolve against wherever
  // Vite bundled this module's own asset file — a different, wrong base).
  // Production serves this app at .../BerryStudio/cloth-lab/, so '../'
  // correctly lands on .../BerryStudio/ (the root app, per vite.config.js's
  // `base`). In local dev (cloth-lab's own server at :5173, root at :4173)
  // this harmlessly clamps to the origin root instead — there's no real
  // "root app" one level up from a bare dev server to link to anyway.
  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <h1 style={styles.title}>3D Cloth Lab</h1>
        <p style={styles.note}>
          {state.signedIn
            ? 'Your free trial has ended. Subscribe in BerryStudio to keep using Cloth Lab.'
            : 'Sign in from BerryStudio to start a 30-day free trial of Cloth Lab.'}
        </p>
        <a style={styles.btn} href="../">Open BerryStudio</a>
      </div>
    </div>
  )
}

const styles = {
  wrap: { position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0f16', color: '#eef0f7', fontFamily: 'Inter, system-ui, sans-serif' },
  card: { maxWidth: 360, textAlign: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: 800, margin: '0 0 12px' },
  note: { fontSize: 14, lineHeight: 1.6, color: '#9aa2b8', margin: '0 0 18px' },
  btn: { display: 'inline-block', padding: '10px 22px', borderRadius: 10, background: '#8b7dff', color: '#0d0f16', fontWeight: 700, textDecoration: 'none' },
}
