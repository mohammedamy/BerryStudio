// WP-8.6 skin-tone preset table — shared by ui/AvatarPanel.jsx (the picker)
// and scene/Scene.jsx (resolving the selected id to a hex color for
// Avatar.jsx). Lives in body/, not ui/, so the scene layer doesn't need to
// import a UI component module just to resolve a color.
//
// A broad, deliberately simple 6-tone spread rather than a precise
// Fitzpatrick/Von Luschan calibration, matching this app's existing
// "readable approximation, not a medical instrument" posture elsewhere
// (fabricPresets.js's own header comment makes the same call for fabric
// physics). Only affects the PROCEDURAL avatar (Avatar.jsx) — a loaded GLB
// avatar carries its own baked-in skin texture/material, which this
// doesn't touch. Hair stays out of scope, as before this pass.
export const SKIN_TONES = [
  { id: 'porcelain', label: 'Porcelain', hex: '#f2d3bd' },
  { id: 'fair', label: 'Fair', hex: '#e3b08c' }, // the previous single hardcoded default
  { id: 'medium', label: 'Medium', hex: '#c98d62' },
  { id: 'tan', label: 'Tan', hex: '#a86b41' },
  { id: 'deep', label: 'Deep', hex: '#7a4a2b' },
  { id: 'ebony', label: 'Ebony', hex: '#4a2c1c' },
]
export const DEFAULT_SKIN_TONE = 'fair'

export function resolveSkinToneHex(id) {
  return SKIN_TONES.find((t) => t.id === id)?.hex ?? SKIN_TONES.find((t) => t.id === DEFAULT_SKIN_TONE).hex
}
