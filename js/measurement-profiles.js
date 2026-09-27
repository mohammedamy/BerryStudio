/* Named measurement profiles and immutable project snapshots (P7-02).
   Measurements are stored canonically in centimetres even when the profile's
   preferred display unit is inches. This keeps drafting/export deterministic. */

export const MEASUREMENT_PROFILE_VERSION = 1;
export const PROFILE_MEASUREMENT_KEYS = Object.freeze([
  "chest", "waist", "hips", "shoulder", "backLen", "sleeve",
  "neck", "bicep", "inseam", "thigh", "height",
]);

const SOURCES = new Set(["measured", "size-chart", "imported", "estimated", "defaulted"]);
const FITS = new Set(["fitted", "regular", "relaxed"]);
const UNITS = new Set(["cm", "inch"]);

const clone = value => JSON.parse(JSON.stringify(value));

function cleanText(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanMeasurements(input) {
  const output = {};
  for (const key of PROFILE_MEASUREMENT_KEYS) {
    const value = Number(input?.[key]);
    if (!Number.isFinite(value) || value <= 0) throw new TypeError(`measurement:${key}`);
    output[key] = Math.round(value * 1000) / 1000;
  }
  return output;
}

function makeId(now = Date.now()) {
  return `mp-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createMeasurementProfile(input, now = new Date().toISOString()) {
  const name = cleanText(input?.name, 80);
  if (!name) throw new TypeError("profile:name");
  const category = cleanText(input?.category, 24);
  if (!category) throw new TypeError("profile:category");
  const source = SOURCES.has(input?.source) ? input.source : "measured";
  const fitPreference = FITS.has(input?.fitPreference) ? input.fitPreference : "regular";
  const units = UNITS.has(input?.units) ? input.units : "cm";
  return {
    version: MEASUREMENT_PROFILE_VERSION,
    id: cleanText(input?.id, 100) || makeId(Date.parse(now) || Date.now()),
    name,
    units,
    category,
    createdAt: cleanText(input?.createdAt, 40) || now,
    updatedAt: now,
    source,
    notes: cleanText(input?.notes, 1000),
    easeCm: Number.isFinite(Number(input?.easeCm)) ? Number(input.easeCm) : 0,
    stretchPercent: Number.isFinite(Number(input?.stretchPercent)) ? Number(input.stretchPercent) : 0,
    fitPreference,
    bodyShape: cleanText(input?.bodyShape, 120),
    measurements: cleanMeasurements(input?.measurements),
  };
}

export function updateMeasurementProfile(profile, changes, now = new Date().toISOString()) {
  return createMeasurementProfile({ ...profile, ...changes, id: profile.id, createdAt: profile.createdAt }, now);
}

export function snapshotMeasurementProfile(profile, selectedAt = new Date().toISOString()) {
  const clean = createMeasurementProfile(profile, profile.updatedAt || selectedAt);
  const snapshot = { ...clean, selectedAt, measurements: { ...clean.measurements } };
  return Object.freeze({ ...snapshot, measurements: Object.freeze(snapshot.measurements) });
}

export function createWorkingMeasurementSnapshot({ measurements, category, units = "cm", name = "Working measurements" }, selectedAt = new Date().toISOString()) {
  return snapshotMeasurementProfile({
    id: `working-${selectedAt}`,
    name,
    units,
    category,
    createdAt: selectedAt,
    source: "defaulted",
    notes: "",
    easeCm: 0,
    stretchPercent: 0,
    fitPreference: "regular",
    bodyShape: "",
    measurements,
  }, selectedAt);
}

export function parseMeasurementProfiles(json) {
  const parsed = typeof json === "string" ? JSON.parse(json) : json;
  const rows = Array.isArray(parsed) ? parsed : parsed?.profiles;
  if (!Array.isArray(rows)) throw new TypeError("profiles:array");
  return rows.map(row => createMeasurementProfile(row, row?.updatedAt || new Date().toISOString()));
}

export function serializeMeasurementProfiles(profiles) {
  const clean = profiles.map(profile => createMeasurementProfile(profile, profile.updatedAt));
  return JSON.stringify({ version: MEASUREMENT_PROFILE_VERSION, profiles: clone(clean) }, null, 2);
}
