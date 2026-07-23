// Default body measurements per category (cm), ported verbatim from the
// production app's js/data.js BASE table — the single source of truth for
// "what a size-M body looks like" that both apps should agree on.
export const CATEGORIES = ['women', 'men', 'girls', 'boys']

export const DEFAULT_MEASUREMENTS = {
  women: { chest: 88, waist: 70, hips: 96, shoulder: 39, backLen: 41, sleeve: 58, neck: 37, bicep: 28, inseam: 78, thigh: 56, height: 167 },
  men: { chest: 100, waist: 86, hips: 100, shoulder: 46, backLen: 45, sleeve: 64, neck: 40, bicep: 33, inseam: 82, thigh: 60, height: 178 },
  girls: { chest: 68, waist: 60, hips: 72, shoulder: 31, backLen: 31, sleeve: 44, neck: 30, bicep: 21, inseam: 58, thigh: 40, height: 134 },
  boys: { chest: 70, waist: 63, hips: 73, shoulder: 32, backLen: 33, sleeve: 46, neck: 31, bicep: 22, inseam: 60, thigh: 41, height: 138 },
}

export const MEASUREMENT_KEYS = ['chest', 'waist', 'hips', 'shoulder', 'backLen', 'sleeve', 'neck', 'bicep', 'inseam', 'thigh', 'height']

export const MEASUREMENT_LABELS = {
  chest: 'Chest / Bust', waist: 'Waist', hips: 'Hips', shoulder: 'Shoulder width',
  backLen: 'Back length', sleeve: 'Sleeve length', neck: 'Neck', bicep: 'Bicep',
  inseam: 'Inseam', thigh: 'Thigh', height: 'Height',
}
