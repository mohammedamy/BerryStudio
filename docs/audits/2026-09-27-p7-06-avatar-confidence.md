# P7-06 avatar and simulation confidence record

Date: 27 September 2026

## Scope

This checkpoint covers the bundled rigged-avatar path, switching from a failed
custom avatar to a later valid choice, and the language-visible boundary of 3D
and Cloth Lab output. It does not claim garment fit, material accuracy, maker
approval, sample approval or production readiness.

## Automated evidence

| Area | Evidence | Result |
| --- | --- | --- |
| Root application | `npm test` | 375 passed, 0 failed |
| Root EN/AR UI | `node --test test/i18n-coverage.test.js` | 2 passed, 0 failed |
| Cloth Lab static quality | `npm run lint` | Passed; 7 pre-existing warnings, no errors |
| Embedded Cloth Lab artifact | `npm run build:embed` | Passed |
| Avatar skeleton handling | `GLBAvatar.jsx` uses Three.js `SkeletonUtils.clone` before normalization, repose and collision derivation | Reviewed in source |
| Replacement safety | `BodyAvatar.jsx` clears the shared collision-rig ref on every avatar URL change and keys its error boundary by URL | Reviewed in source |
| Evidence disclosure | `index.html` and Cloth Lab render bilingual indicative-only notices | Root i18n coverage passed; Cloth Lab build passed |

## Fixture coverage

The bundled chooser exposes the eight rigged assets under `avatars/rigged/`:
`man`, `fatman`, `woman2`, `boy`, `boy2`, `girl`, `girl2` and `girl3`. The root
browser suite already has a bundled-avatar selection and migration smoke path.
This checkpoint did not rerun a physical-device, per-model visual matrix.

## Remaining evidence

- Test each bundled avatar on supported desktop and mobile WebGL devices,
  recording grounding, pose, switching, cloth collision and export results.
- Physically inspect USDZ Quick Look on iOS before claiming that export path.
- Compare simulated material behavior with a sewn sample for each supported
  garment family and fabric class.
- Record maker review and sewn-sample decisions separately from geometry and
  simulation checks.
