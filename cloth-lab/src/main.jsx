import { createRoot } from 'react-dom/client'
import './index.css'
import './standalone.css'
import EntitlementGate from './EntitlementGate.jsx'

// No StrictMode: it double-invokes effects in dev, which double-constructs
// WebGL/GPUComputationRenderer resources unless every effect is perfectly
// idempotent — not worth the churn for a physics-heavy app like this one.
//
// EntitlementGate (BerryStudio-Upgrade-Plan-v3.2 WP-42 Stage B): only used
// by THIS standalone entry, not embed.js's mount() — see that component's
// own header comment for why the embedded path doesn't need its own
// redundant check. Deliberately no `import App from './App.jsx'` here —
// EntitlementGate dynamically imports App.jsx itself, only once entitled;
// see its own header comment for why a static import here would defeat
// the point.
createRoot(document.getElementById('root')).render(<EntitlementGate />)
