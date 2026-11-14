# QA-004 — Spike A acceptance review

| Field | Value |
|---|---|
| Reviewer | **CHAT E**, the independent QA pass under `RECOVERY_OVERRIDE_DAY22.md` §2.2. An LLM session (Claude) run under the leader's account, **not a human reviewer** |
| Date | 2026-10-01 (Day 22) |
| Subject | `origin/main` @ `8a94172`, after #41 was merged at `a524b25` and #44 at `8a94172` |
| Rule applied | `RECOVERY_OVERRIDE_DAY22.md` §4. Spike A is ACCEPTED if QA-004 passes on the raw evidence, with these limitations recorded: A1 and A12 partial; A8/A10/A11 measured on the 64×64×16 fixture |
| Spike owner | Phạm Tuấn Anh. The QA was not run by the owner |

## Verdict

**NOT ACCEPTED under the rule exactly as pre-declared. The leader's decision on two unlisted limitations is still needed.**

- No criterion failed. No evidence file was rejected. Every measured value re-derives from the committed raw device logs.
- One acceptance clause is **not measured** and is not in the pre-declared list (L4 below): the second limb of `NFR-PERF-001` inside A9.
- §4 says: "If a rule does not hold, the gate stays open and the leader is asked."
- With L4 and L5 recorded by the leader as accepted limitations, the evidence supports **ACCEPTED-WITH-LIMITATIONS (L1–L5)**. No new measurement is needed.

Suggested decision text for the leader:

> Spike A ACCEPTED-WITH-LIMITATIONS L1–L5. `NFR-PERF-001` limb 2 ("no full-volume transfer per gesture") cannot be measured in a spike whose fixture is bundled locally. It is carried by Spike E's rejection of whole-volume transfer (`s3`) and by DR-015's per-slice caching. The A2–A7 exactness bounds measured on the 64×64×16 fixture are accepted as size-independent.

## 1 · Inputs and integrity

- **Tree under review.** `origin/main` @ `8a94172` was exported with `git -c core.autocrlf=false archive`, so the bytes are exactly the committed blobs with no line-ending conversion.
- **Integrity check.** All 65 files under `spikes/spike_a_2d/`, `management/spikes/SPIKE_A_2D/` and `management/day10/qa004_spike_a/` match their git blob ids (0 mismatches). That check was made on an export whose tree ids for these three directories are identical to `8a94172`'s.
- **Nothing was run on a working copy.** The shared checkout was not used.

## 2 · QA-004 harness

```
python management/day10/qa004_spike_a/run_qa004.py --json <scratch>/qa004.json     # from the export root
```

**Exit 0.** The export is not a git checkout, so the harness's own HEAD / clean-tree line prints "not a git repository". Tree identity is established in §1 instead.

| Part | Result |
|---|---|
| Offline re-run | `check_conformance.py` (F1–F5) ok · `test_viewer_math.mjs` (F4) ok · `test_brush.mjs` (F5) ok · `test_persist.mjs` (F6) ok |
| Criteria from raw evidence | OBSERVED 10 (A2–A11) · NOT MEASURED 2 (A1, A12 — no machine evidence by design) · FAIL 0 · REJECTED 0 |
| Caveat raised | `operator not recorded` (A9 record) |

## 3 · Red-team checks

### 3.1 Every evidence record re-derived from its raw log

I re-ran the committed extractors on the committed raw logcats:

```
python spikes/spike_a_2d/harness/<extractor> --file spikes/spike_a_2d/EVIDENCE_RAW/<log> --out-dir <scratch>
```

| Raw log | Extractor | Committed record | Result |
|---|---|---|---|
| `a2_zoom_pan_20260914T212552+0700_logcat.txt` | `extract_a2.py` | `a2_zoom_pan_20260914T212552+0700.json` | identical |
| `s5_device_session_20260915T212121+0700_logcat.txt` | `extract_a2.py` | `a2_zoom_pan_20260915T212121+0700.json` | identical |
| same | `extract_brush.py` | `a3_a7_brush_20260915T212121+0700.json` | identical |
| same | `extract_a10_a11.py` | `a10_a11_brush_feedback_20260919T035007+0700.json` | identical |
| `s8_device_session_20260919T121856+0700_logcat_SPIKE_A.txt` | `extract_a8.py` | `a8_save_reload_20260919T121906+0700.json` | identical |
| same | `extract_a10_a11.py` | `a10_a11_brush_feedback_20260919T121906+0700.json` | identical |

"Identical" means every measured field, verdict and reason matches. The only differences are fields the extractors deliberately leave for a person to fill in, plus hand-added context:
- `build_type`, `operator` and `device_profile`, which the extractors write as `FILL IN BY HAND` / `[RECORD …]`;
- `conditions`, `log_provenance` and notes;
- two extra `measurement_limits` entries on the S8 A10/A11 record: the coverage note and "Fixture is 64x64x16".

### 3.2 A9 — all five records, not only the newest one the harness reads

| Record | Fixture | Policy | p95 recomputed from raw samples (stored value identical) |
|---|---|---|---|
| `…20260911T140919…` | 64×64×16 | — | 65.31 ms |
| `…20260912T005710…` | 576×576×16 | — | 50.23 ms |
| `…20260917T102626…_all` | 576×576×88 | whole volume | 98.72 ms |
| `…20260917T103048…_window` | 576×576×88 | ±3, warm image cache | 115.21 ms all steps · 51.05 in-window · 115.26 miss |
| `…20260917T104053…_window` | 576×576×88 | ±3, cold start | 100.74 ms all steps · 50.84 in-window · 102.73 miss |

All five are within 200 ms. The three S6 runs span two release builds, so the whole-volume vs window comparison is an observation across builds. Each p95 value stands on its own.

### 3.3 Provenance

- **Release builds.**
  - The S6 records carry `build_type` derived from the app's own `__DEV__ === false`.
  - The 2026-09-12 record cites package flags `0x0` (no `FLAG_DEBUGGABLE`).
  - The S4/S5/S8 records carry **hand-recorded** release statements (build command, APK size, build time). Their raw logs contain no build marker; `"end":"release"` in them means a finger lift. QA-004 accepts this by design, since it rejects only placeholders and debug builds, so it is a caveat, not a rejection.
- **Operator.** Missing in **all five** A9 records; the harness flags only the newest. Present in the A2, A3–A7, A8 and A10/A11 records.
- **Device.** `DR006_DEVICE_PROFILE.md` is complete (no placeholders). Conditions were captured before and after S6 and S8, with thermal status `NONE` throughout.
- **Fixture size.**
  - The committed fixture is 64×64×16 (`fixtures/volume_synthetic.json` `shape_xyz`).
  - The S4/S5 sessions (A2–A7) and the S8 session (A8/A10/A11) ran on it; the S8 save records show `nx=64, ny=64, nz=16`.
  - Only A9 was measured at real slice size: 576×576×16 and 576×576×88.
- **RESULT.md is inconsistent with itself.** Its header and table say no `NOT MEASURED` cell remains. Its A9 section ("Ba giới hạn phạm vi còn lại", item 1) says the second half of A9 is `NOT MEASURED`. This review follows the A9 section.

## 4 · Result per criterion

| # | Criterion (bound) | Result | Evidence |
|---|---|---|---|
| A1 | Slice renders correctly with `n / total` (exact match to fixture) | **PARTIAL** | `n / total` and 16-slice navigation were observed by the owner. "Exact match to fixture" was **not checked per pixel**: React Native `Image` filters bilinearly and offers no nearest-neighbour option. The fixture's orientation marker passes `check_conformance.py` F3 (16/16); the app's on-screen orientation was confirmed by eye only. No machine record by design |
| A2 | Zoom/pan leave the source mask unchanged (checksum) | **PASS** | S4: 3 pinch + 1 pan, all 16 slices match. S5 re-check: 6 pinch + 1 pan, all 16 slices match. Both re-derived from the raw logs. 64×64×16 fixture |
| A3 | Brush ADD changes only intended pixels (exact) | **PASS** | `a3_a7_brush_…212121`: the automated A3–A7 replay matches the fixture oracle at every step (RESULT.md breakdown: 8 add, 6 erase, 15 undo, 15 redo, plus reset). Re-derived from the raw log. 64×64×16 |
| A4 | Brush ERASE changes only intended pixels (exact) | **PASS** | same record |
| A5 | Pixel-correct mapping after zoom/pan (stated tolerance) | **PASS** | 60/60 cases at r = 0 and 60/60 at r = 2. (dx, dy) = (0, 0) for all 50 in-image cases; the 10 out-of-image cases paint nothing. **Proposed tolerance: 0 source pixels.** Brush-after-zoom screenshot committed. 64×64×16 |
| A6 | Undo reproduces the prior state (exact) | **PASS** | same record (undo walk and undo-all) |
| A7 | Redo reproduces the undone state (exact) | **PASS** | same record (redo walk and redo-all) |
| A8 | Save/reload reproduces edits (exact) | **PASS** | `a8_save_reload_…121906`: 6 saves with edits; **2 cold reloads** after force-stop returned the exact bytes of an edited save; 32 slice checksums verified; plus 5 warm reloads. Re-derived from the raw log. 64×64×16 |
| A9 | 30-step cached switch p95 ≤ 200 ms; no full-volume transfer per gesture | **PASS on limb 1 · limb 2 NOT MEASURED** | Limb 1: all five records within 200 ms (§3.2), including the real cohort size 576×576×88. Limb 2: not measurable in a local-fixture spike with no network path (stated in RESULT.md's A9 section). See L4 |
| A10 | Brush feedback ≤ 100 ms; zero committed samples lost | **PASS** | `a10_a11_brush_feedback_…121906`: worst per-stroke feedback **30.48 ms** over 123 committed strokes (136 total); 0 committed samples lost. Feedback is a JS-side next-frame proxy, so it is a lower bound on end-to-end latency. Radius 0 not exercised. 64×64×16 |
| A11 | Edit vs navigation gestures cause no accidental edits | **PASS** | same record: 12 second-finger interruptions, all rolled back; 0 strokes committed in a multi-finger gesture; 0 committed without a clean lift; 20/20 gesture records carry a stroke outcome. 64×64×16 |
| A12 | Development-cost observation per candidate | **PARTIAL** | A qualitative React Native / Expo note exists (RESULT.md §A12). Only one candidate was built, so there is no comparison. No machine record by design |

## 5 · Limitations

**Pre-declared (§4):**
- **L1** — A1 partial (no per-pixel match).
- **L2** — A12 partial (a single candidate framework).
- **L3** — A8, A10 and A11 measured on the 64×64×16 fixture.

**Found by this review, not in the pre-declared list:**
- **L4** — A9 limb 2, "normal slice gestures shall not trigger a full-volume network transfer" (`04` NFR-PERF-001), is **not measured in Spike A**.
  - Spike A's fixture is bundled locally and has no network path.
  - At design level the limb is carried by Spike E, whose RESULT rejects whole-volume transfer `s3` because it violates this limb, and by DR-015 (per-slice caching).
  - **This is the item that keeps the pre-authorisation from applying.**
- **L5** — A2–A7 were **also** measured on the 64×64×16 fixture (sessions S4/S5), not only A8/A10/A11. Their bounds are exactness checks (checksums, oracle matches), so they are size-independent in principle, but they were not re-run at cohort size.

**Recorded in the evidence; these do not change the result:**
- A10 latency is a lower-bound proxy.
- One device and one session per stage.
- The S6 whole-volume vs window comparison spans two builds; the build commits were not recorded (RESULT.md §S6).
- One candidate framework only (React Native / Expo).

**Caveats:**
- `operator` is missing on all five A9 records.
- The release status of the S4/S5/S8 builds is hand-recorded rather than app-reported.

## 6 · Non-blocking housekeeping

1. `RESULT.md`: fix the header ("11/12 tiêu chí có dữ liệu … không còn ô `NOT MEASURED`") and the A9 table row so they carry L4. Also, the A12 table's "Chưa đánh giá" row is stale, because brush latency and A11 have since been measured.
2. `run_qa004.py` scores only the newest file per criterion and reads A9 limb 1 as the whole criterion. Consider scoring every record and reporting limb 2 explicitly. Its docstring points at `management/day10/QA_REVIEW_004_SPIKE_A.md`; this review lives under `management/day22/`.
3. In `SPIKE_PHASE_STATE.yaml`, `SPIKE_A` still says `latest_tested_commit: 6ca1e21`.

---

## 7 · Disposition *(added by the leader's session; not part of the QA report)*

| Item | Decision |
|---|---|
| **L4** | Measured on 2026-10-01 at 20:58 in the product app (V1 SCR-03, APK from `ffbf763`) on the A17 against the real backend: **L4 PASS**, p50 153.5 KB and max 155.1 KB per new slice (1.1 % of a volume), revisits 0 bytes; the server log agrees. Evidence: `spikes/spike_a_2d/EVIDENCE_RAW/l4_product_app_20261001T205817+0700/` |
| **L5** | **Accepted as a limitation** by Phạm Tuấn Anh on 2026-10-01 at 21:17: A2–A7 are exactness checks measured on the 64×64×16 fixture, not re-run at cohort size |
| **Spike A** | **ACCEPTED-WITH-LIMITATIONS L1–L3, L5**, by the leader's explicit decision (not the pre-declared rule as written) |
| **GATE-MOB-01** | **CLOSED** 21:17 (`management/adr/TECH_STACK_ADR.md` §8). The 3D module stays conditional on Spike B |
| Housekeeping §6 | Item 1 (RESULT.md header, A9 row, A12 row) done; item 3 (`latest_tested_commit`) done; item 2 (`run_qa004.py`) open for Day 23 |

