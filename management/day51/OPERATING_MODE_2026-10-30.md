# OPERATING MODE FROM 2026-10-30 (Day 51) — single operator, acceptance on 2026-11-08

| Field | Value |
|---|---|
| **Decided by** | Phạm Tuấn Anh — Team Leader, in session on 2026-10-30 around 18:45 (pace and care added around 19:00) |
| **Recorded by** | Project Control (the leader's Claude session) |
| **Replaces** | the per-member execution of `management/day40/REPLAN_TO_2026-10-31.md` (C1–C4) and the 2026-10-31 acceptance date |
| **Decision entry** | `DR-023` in `management/readiness/OPEN_DECISIONS.md` (Part 2b) |
| **Work list** | `management/day51/WORK_INVENTORY.md`: every remaining item with its source, done criterion, check and status |

## 1 · Why

| Fact (checked 2026-10-30 18:38 against the repository) | Value |
|---|---|
| Repository activity since 2026-10-18 | Bế Quốc Khánh: #105 (revalidation, 10-19) and #106 (V3 QA items, 10-29). Nguyễn Gia Đức Trung: none since 10-01. Vũ Hùng Anh: none since 10-02 |
| UNet family | not trained (the queue dry-run in #105 shows EXP-U-025/050/100 NEW) |
| Device evidence of the product app | L4 only (2026-10-01); TC-PERF-001 and the screen tour not run |
| MUST requirements accepted | 0 / 33 (`management/day40/ACCEPTANCE_TRACE.md`) |

## 2 · Decisions

| ID | Decision |
|---|---|
| **Acceptance date** | **2026-11-08**, replacing 2026-10-31 |
| **Single-operator mode** | From 2026-10-30 all remaining work runs through the leader's account and its Claude sessions. Work is no longer divided per member. Every PR merges after an independent LLM QA pass (recorded as such, never as a human review) plus green CI; the leader decides. The per-member revalidation tables become optional records |
| **Ownership for the defense** | The V1–V4 ownership of `DR-013` is kept **only as the defense mapping** of the Mobile course (CLO3: each member analyses, designs, implements and defends one function). Each member's evidence package states which parts were built by agents under the leader's account. Nothing is written in a member's name that they did not do |
| **Subjects** | **Machine Learning, Image Processing, Mobile Application Development.** Data Science is no longer a reporting subject. The product scope is unchanged: its data-science features stay and are tested |
| **Reports and slides** | One report and one deck **per subject** (three of each), written after the product is complete and the device evidence exists, without haste. The draft deck of #102 is source material only |
| **DR-005** | Decided: the **full 3D error map** (see the DR-005 entry in `management/readiness/OPEN_DECISIONS.md`) |
| **UNet** | Stays with Bế Quốc Khánh (GPU). The one-command pipeline of #100 takes it from finished runs to the app. If it is not trained, the ML report states the model comparison as a limitation |
| **Pace and care** | Quality before speed. The leader, 2026-10-30 evening: more than a week remains; clarify every detail and work carefully; skip no small detail. Each unit is finished and verified before the next one starts. The dates in §3 are latest-by dates, not targets to rush. Every item lives in `WORK_INVENTORY.md`; an item is closed only with its check and its evidence named there |
| **Acceptance** | A requirement becomes `ACCEPTED` only when the leader marks it, on committed evidence (`13` §6; the evidence rules of `management/day40/ACCEPTANCE_TRACE.md` §1.2). Project Control proposes and never marks `ACCEPTED` itself. Device evidence is taken by the leader on the target phone through `mobile/scripts/device_session.ps1` and its successors |
| **Working rules** | The pstack *poteto-mode* principles the leader asked to apply, adapted to this repository: name the data shape first; prove it works on the real artifact; sequence work into verifiable units; test behaviour, not implementation (with mutation checks on key fixes); fix root causes; explain every measured number (run count, spread, limiter); prototype an empirical fork instead of asking. Repository rules stay: no force-push, no deletion without the leader, frozen specs, no holdout access outside a record, no dataset/checkpoint/IP/serial/per-case values in git |

## 3 · Plan to 2026-11-08

| Phase | Dates | Exit |
|---|---|---|
| P1 · Product completion | 30/10 → 02/11 | 3D error map + 2D↔3D linkage (V2); every open QA finding closed; #105, #106 settled; Mac mini redeployed; API E2E all PASS except UNet |
| P2 · Device evidence | phone session 1 on 30/10 (TC-PERF-001 + rehearsal tour); session 2 on the final build by 03/11 | screenshots of every screen, TC-PERF-001/002/003, hero-flow video ×5 (TC-USAB-005), TC-E2E-001 |
| P3 · Acceptance evidence | 03/11 → 04/11 | `ACCEPTANCE_TRACE.md` updated; requirement → test → evidence matrix; implemented UI vs design (CLO1/CLO2) |
| P4 · Reports and decks | 04/11 → 07/11 | ML, Image Processing and Mobile: one report + one deck each, reviewed by the leader; four Mobile defense packs (CLO3) |
| Acceptance | 08/11 | — |
