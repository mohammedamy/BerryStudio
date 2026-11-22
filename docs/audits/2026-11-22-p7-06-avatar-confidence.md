# P7-06 avatar and simulation confidence record — 2026-11-22

Supersedes as the latest automated checkpoint (preserving `docs/audits/2026-09-27-p7-06-avatar-confidence.md` as the historical record).

## Scope

Covers the expanded `44`-mannequin studio catalog (`XXS–6XL` × 4 categories), bundled rigged GLB avatars (`man`, `fatman`, `woman2`, `boy`, `boy2`, `girl`, `girl2`, `girl3`), bilateral garment placement and Cloth Lab GPU simulation across catalog patterns and the `woven-basic-trousers` program. It does not claim physical fit, material accuracy, maker approval, sample approval, or production readiness.

## Automated evidence

| Area | Evidence | Result |
| --- | --- | --- |
| Root application | `npm test` (`node --test`) | `500` passed, `0` failed |
| Root EN/AR UI parity | `node --test test/i18n-coverage.test.js` | Passed within `500/500` root run (`I18N.en` / `I18N.ar` exact key parity) |
| Cloth Lab static & unit suite | `cd cloth-lab && npm run lint && npm test` | Lint exited `0`; Vitest `45` test files passed, `992` tests passed |
| 44-mannequin collision envelopes | `cloth-lab/src/body/mannequinCatalog24.test.js` | `5/5` passed (`11` women, `11` girls, `11` men, `11` boys across `XXS–6XL`) |
| Full library zero-penetration assembly | `cloth-lab/src/body/zeroPenetration320.test.js` | Passed within `45/45` Vitest run (`0` finite/penetration/stretched-seam failures) |
| Trousers program Cloth Lab integration | `cloth-lab/src/pattern/importFromApp.trousersProgram.test.js` | `5/5` passed (`short`/`regular`/`long` women/M & men/L bilateral outseam/inseam + GPU rest assembly) |
| Cloth Lab browser E2E | `playwright` (`cloth-lab`) | `5` passed (substep velocity preservation, degenerate triangles, normal rings, sleeve tube & 1-click split) |
| Root browser E2E (including 3D preview & workflow) | `playwright` (root) | `68` passed |

## Remaining external evidence

- Verify each bundled rigged GLB avatar across physical desktop and mobile WebGL devices for grounding, pose, switching, cloth collision, and export behavior.
- Physically inspect exported USDZ files in iOS Quick Look on iPhone/iPad.
- Compare simulated drape against sewn physical samples across all 4 supported woven garment families (`skirt`, `bodice`, `dress`, `trousers`).
