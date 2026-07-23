import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// No StrictMode: it double-invokes effects in dev, which double-constructs
// WebGL/GPUComputationRenderer resources unless every effect is perfectly
// idempotent — not worth the churn for a physics-heavy app like this one.
createRoot(document.getElementById('root')).render(<App />)
