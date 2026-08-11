import { createRoot } from 'react-dom/client'
import './index.css'
import './standalone.css'
import App from './App.jsx'
import EntitlementGate from './EntitlementGate.jsx'

// No StrictMode: it double-invokes effects in dev, which double-constructs
// WebGL/GPUComputationRenderer resources unless every effect is perfectly
// idempotent — not worth the churn for a physics-heavy app like this one.
//
// EntitlementGate (BerryStudio-Upgrade-Plan-v3.2 WP-42 Stage B): only
// wraps THIS standalone entry, not embed.js's mount() — see that
// component's own header comment for why the embedded path doesn't need
// its own redundant check.
createRoot(document.getElementById('root')).render(
  <EntitlementGate>
    <App />
  </EntitlementGate>
)
