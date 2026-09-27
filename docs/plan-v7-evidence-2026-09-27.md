# Plan v7 verification — 2026-09-27

## Resolved evidence

| Area | Result | Evidence |
|---|---|---|
| Test harness deployment | Resolved | Production `main` at `75c0353`; deploy workflow run `35611908926` succeeded. The deployed harness uses the threaded Python test server, explicit loopback readiness checks, startup diagnostics, and onboarding readiness waits. |
| Production desktop Chromium | Resolved | `https://berrystudio.org/` returned 200, initialized four pattern pieces, switched EN/AR direction, exported valid SVG/PNG, and initialized a non-zero 3D canvas. |
| Production desktop Safari-compatible WebKit | Resolved | Same production checks passed in Playwright WebKit, including valid SVG/PNG and a non-zero 3D canvas. |
| Production mobile iOS-compatible WebKit | Resolved | iPhone 15 viewport passed app readiness, mobile menu/settings, EN/AR direction, provider UI, and non-zero canvas checks. |
| Production mobile Chromium | Resolved | Pixel 7 viewport passed app readiness, mobile menu/settings, EN/AR direction, provider UI, and non-zero canvas checks. |
| AI/image providers | Resolved | Production exposed all configured adapter capabilities. The provider and Image Studio contract suite passed 31/31 cases, including request shapes, model handling, mocked API round-trips, and explicit no-credential/no-endpoint failures. No billable third-party generation was performed. |
| P7-02 measurement profiles | Started | Named versioned profiles now include units, category, timestamps, source, notes, ease, stretch, fit preference, body-shape context, and a complete explicit measurement set. Applying a profile stores a detached project snapshot; project JSON always exports a measurement snapshot instead of relying on a hidden size-chart fallback. Unit tests pass and the bilingual browser flow passes in Chromium and WebKit. |

## Pending evidence

| Area | Status | Required evidence |
|---|---|---|
| Physical iOS Quick Look / USDZ | Pending | Open a generated USDZ on a physical iPhone or iPad in Quick Look and capture device/model, iOS version, file, successful render, scale/orientation result, and screenshot or recording. |

This is the only remaining evidence item in this verification pass.
