# QA-ADR delta check: `docs/tech-stack-adr` @ `8452be9` (one commit on `9a23386`)

**Reviewer:** CHAT E, an LLM red-team session (Claude), not a human reviewer. Read-only as before: `git show` / `git grep` and Python reads of blobs; no checkout, fetch or worktree. The shared checkout is still `main` @ `c7a37e0`, with only `?? .claude/`.

> **VERDICT: PASS WITH NOTES.**
> - B-1 to B-4 are resolved in the wording I gave.
> - N-1 to N-7 match my intent.
> - There are three small new inaccuracies (D-1 to D-3). None blocks the gate.
> - I recommend applying D-1 and D-3 before tonight, so that only the L4 lines change tonight.
> - Under outcome (a) the ADR is ready to close GATE-MOB-01 with the re-anchored E1–E10 below. Five of the old anchors (E5, E6, E8, E9, E10) no longer exist word for word.

## 1 · B-1 to B-4 and N-1 to N-7

| Item | Status |
|---|---|
| **B-1** | ✔ Fixed: Status reads PROPOSED / not pre-authorised; "Decided by" reads "explicit decision (pending)"; QA-004 is in the Inputs; §8 says the gate stays OPEN. |
| **B-2** | ✔ Fixed: the A9 row now has both limbs and the 100.74 / 50.84 / 102.73 ms split, and the Limitations row lists L1–L5. |
| **B-3** | ✔ Fixed: #66 is in the Inputs, the B10/B11 row says the FPS does not carry over, there is a B5/B9/B12 row, and criterion 2 reads CONDITIONAL. The reopen trigger sits in §8; Residuals and §7 point to it. |
| **B-4** | ✔ Fixed: new heading; criterion 1 MET; criterion 3 PARTIAL. |
| **N-1, N-2, N-3, N-5, N-6, N-7** | ✔ Applied as intended. |
| **N-4 (option ii)** | ✔ The §5 text is applied. The §7 half overreaches; see D-3. |

## 2 · New inaccuracies

**D-1 · (low–medium) Residuals and the last §3 row drop B5 and B12 from the override's list of V2 acceptance conditions.**
- **What the override says.** Override §4 lists "B5/B6/B7/B9/B12/B13 become V2 acceptance conditions". Its "Spike B ACCEPTED" rule needs "B12 table with ≥ 3 levels", with FPS per level.
- **What #66 left open.** #66 says "The device run checks the same picks in the WebView" and "the Spike B owner confirms or rejects on Day 23". Its FPS and stall columns are NOT MEASURED.
- **Fix, Residuals cell:**
```text
Spike B B5/B6/B7/B9/B12/B13 are **V2 acceptance conditions** (override §4). #66 measured B5, B9 and the B12 geometry columns offline on a real mask; still to come on the device on 2026-10-01 evening (slot S-1): B6, B7, device B9, FPS and stall per level for B10/B11 and B12 (≥ 3 levels), the on-device check of B5's picks, and B13. The reopen trigger for the 3D module is in §8
```
- **Fix, §3 row "B6, B7, device B9, B10/B11 at the real level, B13":**
```text
| B6, B7, device B9; FPS and stall per level for B10/B11 and B12 (≥ 3 levels); the on-device check of B5's picks; B13 | Measured on the device on 2026-10-01 evening (S-1) as V2 acceptance conditions; see Residuals |
```
- **Fix, §3 B5/B9/B12 row.** Append:
```text
. Computed offline under the override; the Spike B owner confirms or rejects on Day 23
```
- **Fix, §8 reopen sub-bullet.** Date-proof it: change `so tonight's deciding test is` to `so the deciding test (S-1, 2026-10-01 evening) is`.

**D-2 · (low; my own wording, from the old (b) E8) §8 says "`mobile/` work continues as override skeletons".**
- Override §2 limits only V2/V3/V4 to working skeletons. V1 and the shell (#77) are full override work.
- **Fix:**
```text
`mobile/` work (PR #77) continues under the override and is listed for Day 23 revalidation; V2/V3/V4 stay working skeletons (`RECOVERY_OVERRIDE_DAY22.md` §2).
```
- This only matters in outcomes (b) and (c); under (a), E8 replaces the sentence.
- **Sequencing:** if #77 merges before the gate closes, record it as an override merge.

**D-3 · (low; my own N-4 wording overreached) §7 says `mobile/README.md` lists "its lockfile-resolved version".**
- The README at #77's head `4f46b37` (unchanged) lists ranges and licences only. It has no 57.0.26 and no resolved column.
- **Fix, either:**
  - add a "Resolved (lockfile)" column to #77's README; or
  - change the §7 sentence to:
```text
Each is listed in `mobile/README.md` with its version or version range and its licence; `package-lock.json` pins the resolved versions (PR #77, not yet merged).
```

**D-4 · (info) Name clash.** "E8/E10" in the Transport row and in §8 means Spike E's criteria. My edit IDs E1–E10 are unrelated. Do not apply an edit to those strings.

## 3 · Publication hygiene

**PASS.**
- **ADR:** 11,367 bytes. **QA report:** 30,673 bytes. Both are UTF-8, LF, no BOM, and end in a newline.
- The scan looked for absolute paths, IPv4 addresses, emails, URLs, overlay or host suffixes, a device-serial pattern, 16-hex network ids, ports, and scratch or temp paths.
- **ADR:** 0 hits.
- **Two benign hits:**
  - Line 33 of the QA report uses the word `localhost` as the name of a scan pattern.
  - The commit message's `Co-Authored-By` line carries the standard public no-reply address.
- The committed QA report matches what I returned and has no editorial edits. A "Disposition" section, like QA-005 §5, can be added after the decision.

## 4 · Outcome (a) tonight: E1–E10 re-anchored to the new text

Apply these find → replace pairs exactly. Placeholders:
- `<HH:MM>`: the decision time
- `<x>`, `<y>`: KB values from `l4-report.mjs`
- `<scope line>`: the report's `scope:` line, verbatim
- `<case>`: the case measured (default CASE_0061)
- `<sha>`: the APK git sha from `.build.txt`
- `<path>` / `<commit>` / `#<n>`: where the evidence is committed. If it is not on `main`, add `, not on main yet`.

**E1 · Status cell.**
- Replace the whole cell with:
```text
| **Status** | ACCEPTED — 2026-10-01 <HH:MM> (Day 22), by the leader's explicit decision after the S-1 L4 measurement. Spike A ACCEPTED-WITH-LIMITATIONS L1–L3, L5 (QA-004); L4 measured PASS in the product app (§3, A9 row). The early close before Spike B is ACCEPTED is the deviation pre-authorised in `management/day22/RECOVERY_OVERRIDE_DAY22.md` §4; the 3D module is conditional (§8) |
```

**E2 · Decided by.**
- Find:
```text
by explicit decision (pending).
```
- Replace:
```text
by explicit decision at <HH:MM> (the §4 pre-authorisation did not apply as written: QA-004, L5).
```

**E3 · Inputs.**
- Find:
```text
QA-004 (`management/day22/QA_REVIEW_004_SPIKE_A.md`) |
```
- Replace:
```text
QA-004 (`management/day22/QA_REVIEW_004_SPIKE_A.md`); L4 product-app measurement (`<path>` @ `<commit>`, PR #<n>) |
```

**E4 · A9 row, limb 2.**
- Find:
```text
<br>**Limb 2:** not measured in Spike A (local fixture, no network path). That is L4; see §8 |
```
- Replace:
```text
<br>**Limb 2:** not measurable in Spike A (L4); **measured PASS in the product app** on the A17 against the real backend, 2026-10-01 <HH:MM>.<br>• `l4-report.mjs`: L4 PASS (R1–R8); 15 new + 15 revisit gestures; bytes per switch p95 <x> KB, max <y> KB; 15/15 revisits at 0 bytes<br>• Scope: `<scope line>` on <case>. No analysis run was ingested, so prediction transfers are not covered<br>• Release APK from `<sha>`, built after the last code change; evidence `<path>` |
```

**E5 · Limitations row.** This now appends; it no longer replaces.
- Find:
```text
<br>L4 and L5 are outside the limitations pre-declared in `RECOVERY_OVERRIDE_DAY22.md` §4 |
```
- Replace:
```text
<br>L4 and L5 are outside the limitations pre-declared in `RECOVERY_OVERRIDE_DAY22.md` §4.<br>L1, L2, L3 and L5 accepted by the leader on 2026-10-01 <HH:MM>. L4 closed by the product-app measurement in the A9 row (MRI + ground-truth path only) |
```

**E6 · Transport row.** Keep the ADR-ART-001 / Spike E "E8/E10" sentence unchanged.
- Find:
```text
(DR-015 limb 2; `NFR-PERF-001` limb 2, measured in the product app tonight, see §3 A9)
```
- Replace:
```text
(DR-015 limb 2; `NFR-PERF-001` limb 2 measured PASS in the product app on 2026-10-01, MRI + ground-truth path; see §3 A9)
```

**E7 · §8, sentence 1.**
- Find:
```text
`GATE-MOB-01` stays **OPEN** until the leader decides on Spike A (QA-004 L4, L5) after tonight's L4 measurement.
```
- Replace:
```text
`GATE-MOB-01` → **CLOSED** on 2026-10-01 at <HH:MM> by the leader's explicit decision: Spike A ACCEPTED-WITH-LIMITATIONS (L1–L3, L5) with L4 measured PASS, and the Spike B framework evidence named in override §4 on record (#44; B1–B4, B8, B14 diagnostic PASS).
```

**E8 · §8, sentences 2–3.**
- Find:
```text
While the gate is open, this ADR locks no production mobile architecture (`09` §1.1). `mobile/` work continues as override skeletons (`RECOVERY_OVERRIDE_DAY22.md` §2).
```
(Or the D-2 version of that sentence, if D-2 has been applied.)
- Replace:
```text
Production mobile modules may now be created under `mobile/`; the V2 3D module stays a skeleton until Spike B is ACCEPTED.
```

**E9 · §8, paragraph 2.** Two replacements.
- Find:
```text
If the gate closes, it is an **early close, and a documented deviation.**
```
- Replace:
```text
This is an **early close, and a documented deviation.**
```
- Find:
```text
The leader pre-authorised the Spike B part of this deviation (`RECOVERY_OVERRIDE_DAY22.md` §4). It applies only once Spike A is ACCEPTED, and the Spike A decision is the leader's explicit one (QA-004). The proposed scope:
```
- Replace:
```text
The leader authorised the Spike B part of this deviation in advance (`RECOVERY_OVERRIDE_DAY22.md` §4) and took the Spike A decision explicitly at <HH:MM> (QA-004). The deviation is scoped as follows:
```

**E10 · §8 bullet label.**
- Find:
```text
- **Final once the gate closes:**
```
- Replace:
```text
- **Final (gate closed <HH:MM>):**
```
- The sub-bullets, the backend/transport paragraph, "Conditional on Spike B" and the reopen trigger stay unchanged.

**Nothing else changes under (a).** That covers:
- the §4 criteria table;
- the Spike B rows, provided D-1 is applied beforehand;
- §5–§7.

Without D-1, the only "tonight" words left after E6 and E7 are in the §3 last row and the §8 reopen sub-bullet.

### If tonight is not (a)

Only the edits listed below change. E3 applies as in (a) whenever a capture exists. E8–E10 stay as they are now; apply D-2.

**(b) L4 FAIL. Gate OPEN · ADR PROPOSED · Spike A not ACCEPTED.**
- **E1:**
```text
| **Status** | PROPOSED — not accepted. `NFR-PERF-001` limb 2 measured **FAIL** in the product app on 2026-10-01 (<rule(s)>; `<path>`); Spike A is not ACCEPTED and GATE-MOB-01 stays OPEN (`management/day22/RECOVERY_OVERRIDE_DAY22.md` §4: "the gate stays open and the leader is asked"); see §8 |
```
- **E2:** `(pending)` → `(no decision taken)`
- **E4:**
```text
<br>**Limb 2:** not measurable in Spike A (L4); **measured FAIL in the product app**, 2026-10-01 <HH:MM>: `l4-report.mjs` L4 FAIL on <Rn: …>, largest switch <y> KB against one volume ≈ <z> KB; release APK `<sha>`; evidence `<path>` |
```
- **E5:** append:
```text
<br>L4 is now a measured failure in the product app (A9 row), not a limitation: fix in the V1 transport and re-measure
```
- **E6:** `, measured in the product app tonight, see §3 A9)` →
```text
; **not yet met**: the product app at `<sha>` failed it on 2026-10-01, see §3 A9; fix and re-measure before this ADR is accepted)
```
- **E7:**
```text
`GATE-MOB-01` stays **OPEN**: the product app failed `NFR-PERF-001` limb 2 on 2026-10-01, so Spike A is not ACCEPTED. This ADR is accepted only after a fix and a passing re-run of `mobile/S1_L4_SCRIPT.md`.
```

**(c) L4 NOT MEASURED, default. Gate OPEN · ADR PROPOSED.**
- **E1:** in the current Status cell, replace `The leader decides after the S-1 L4 measurement; see §8` with:
```text
`NFR-PERF-001` limb 2 was not measured in the product app on 2026-10-01 (<session not run / `L4 CANNOT_JUDGE` / incomplete capture>); the leader's decision is pending; see §8
```
- **E4:**
```text
<br>**Limb 2:** NOT MEASURED — not measurable in Spike A (L4); the product-app session of 2026-10-01 <did not run / returned `L4 CANNOT_JUDGE`> (<evidence or "no capture">). That is L4; see §8 |
```
- **E6:** `, measured in the product app tonight, see §3 A9)` →
```text
; not yet measured in the product app — a V1 acceptance condition, see §3 A9)
```
- **E7:**
```text
`GATE-MOB-01` stays **OPEN** pending the leader's decision on Spike A (QA-004 L4, L5); L4 was not measured on 2026-10-01.
```
- **E2, E5:** unchanged.

**(c) with the leader's explicit L1–L5 decision. Gate CLOSED by that decision, with L4 open · ADR ACCEPTED.**
- **E1:**
```text
| **Status** | ACCEPTED — 2026-10-01 <HH:MM>, by the leader's explicit decision (not pre-authorised: QA-004). Spike A ACCEPTED-WITH-LIMITATIONS L1–L5; L4 (`NFR-PERF-001` limb 2) is carried at design level by Spike E's rejection of whole-volume transfer and by DR-015 limb 2, and stays an open V1 acceptance condition (`mobile/S1_L4_SCRIPT.md`, Day 23) |
```
- **E2:** as in (a), but with `QA-004, L4 and L5`.
- **E4 and E6:** as in the (c) default.
- **E5:** append:
```text
<br>L1–L5 accepted by the leader on 2026-10-01 <HH:MM>; L4 stays an open V1 acceptance condition
```
- **E7:**
```text
`GATE-MOB-01` → **CLOSED** on 2026-10-01 at <HH:MM> by the leader's explicit decision, with L4 open as a V1 acceptance condition.
```
- **E8–E10:** as in (a).

**Unchanged from my first report:** record the decision before 23:59 (the override does not renew by silence), and put the L4 evidence in a commit before the ADR merge.
