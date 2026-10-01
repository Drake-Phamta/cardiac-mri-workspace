# `s1/` — the S-1 device session page (Spike B, Day 22)

**Throwaway spike code.** Written on 2026-10-01 by a Claude agent under the leader's Day 22
recovery override; Spike B owner **Vũ Hùng Anh** adopts or rejects it on Day 23. The
operator's procedure is [`../S1_SESSION_SCRIPT.md`](../S1_SESSION_SCRIPT.md).

| File | Role |
|---|---|
| `s1_core.js` | pure helpers, node-tested: scripted B10/B11 camera, the 6 auto poses, target → tap projection, the pick / frame-probe record formats |
| `s1_viewer.js` | the page: B1 renderer and gestures copied from `app/viewer.js` (PR #44 `62d39de`), suite runner, pick logging, React Native bridge |
| `frame_probe_pr44.js` | byte-identical copy of PR #44's `app/performance.js` (not merged yet); `test_s1_core.mjs` fails if the two ever differ |
| `index.html` | loads `s1_bundle.js` as ONE classic script (ES modules do not load over `file://` in the Android WebView) |
| `stage_assets.py` | stages the APK assets into the gitignored `mesh/out_real/s1_assets/<stamp>/spike_b_s1/`: the PR #66 OBJ levels (SHA-256 checked), 36 targets on the real surface, 88 mask-slice PNGs for the 2D panel, the bundle |
| `test_s1_core.mjs` | `node spikes/spike_b_3d/s1/test_s1_core.mjs` |

The React Native container is [`../s1_app/`](../s1_app/) (S7 stack, package
`com.cardiacmri.spikebs1`); the workstation tools are in [`../harness/`](../harness/):
`s1_collector.py` (HTTP evidence path), `s1_session.py` (preflight, conditions, logcat),
`s1_extract.py` (B6/B7/B9/B10/B11 from the raw records, truth from the real mask).

```powershell
python spikes\spike_b_3d\harness\real_mesh_frontier.py       # meshes (PR #66), gitignored
python spikes\spike_b_3d\s1\stage_assets.py                  # APK assets, gitignored
powershell -ExecutionPolicy Bypass -File spikes\spike_b_3d\s1_app\build_release.ps1   # release APK
node spikes\spike_b_3d\s1\test_s1_core.mjs
```

Nothing derived from the patient mask is committed: meshes, slice images, the staged
assets, the APK and the raw pick records stay in gitignored folders or outside the
repository; only counts, timings, errors and hashes are tracked.
