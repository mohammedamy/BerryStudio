import test from "node:test";
import assert from "node:assert/strict";
import {
  createMeasurementProfile,
  updateMeasurementProfile,
  snapshotMeasurementProfile,
  createWorkingMeasurementSnapshot,
  parseMeasurementProfiles,
  serializeMeasurementProfiles,
  PROFILE_MEASUREMENT_KEYS,
} from "../js/measurement-profiles.js";

const measurements = Object.fromEntries(PROFILE_MEASUREMENT_KEYS.map((key, index) => [key, 40 + index]));
const base = { name:"Fitting sample", units:"inch", category:"women", source:"measured", notes:"Toile 2", easeCm:3, stretchPercent:8, fitPreference:"fitted", bodyShape:"pear", measurements };

test("creates and updates a complete profile while preserving identity", () => {
  const created = createMeasurementProfile(base, "2026-09-27T10:00:00.000Z");
  const updated = updateMeasurementProfile(created, { notes:"Approved", fitPreference:"regular" }, "2026-09-27T11:00:00.000Z");
  assert.equal(updated.id, created.id);
  assert.equal(updated.createdAt, created.createdAt);
  assert.equal(updated.updatedAt, "2026-09-27T11:00:00.000Z");
  assert.equal(updated.notes, "Approved");
  assert.equal(updated.measurements.chest, 40);
});

test("rejects incomplete measurements so exports never use a hidden fallback", () => {
  assert.throws(() => createMeasurementProfile({ ...base, measurements:{ chest:90 } }), /measurement:waist/);
  assert.throws(() => createWorkingMeasurementSnapshot({ category:"women", measurements:{} }), /measurement:chest/);
});

test("selected profile snapshot is deeply immutable and detached", () => {
  const profile = createMeasurementProfile(base, "2026-09-27T10:00:00.000Z");
  const snapshot = snapshotMeasurementProfile(profile, "2026-09-27T12:00:00.000Z");
  profile.measurements.chest = 999;
  assert.equal(snapshot.measurements.chest, 40);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.measurements), true);
  assert.throws(() => { snapshot.measurements.chest = 20; }, TypeError);
});

test("profile collections round-trip through versioned import/export", () => {
  const profile = createMeasurementProfile(base, "2026-09-27T10:00:00.000Z");
  const json = serializeMeasurementProfiles([profile]);
  const restored = parseMeasurementProfiles(json);
  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0].measurements, profile.measurements);
  assert.equal(restored[0].units, "inch");
});
