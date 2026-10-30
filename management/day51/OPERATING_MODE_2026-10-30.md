# OPERATING MODE FROM 2026-10-30 (Day 51) — single operator, acceptance on 2026-11-08

| Field | Value |
|---|---|
| **Decided by** | Phạm Tuấn Anh, Team Leader, in session on 2026-10-30. §2 gives the source of every item: his message at 18:41, his answers at about 18:45, his evening messages, and his confirmations at 21:55 after the LLM QA of this record. Items marked *Project Control* are the session's own rules or plan, not his decisions |
| **Recorded by** | Project Control (the leader's Claude session) |
| **Supersedes** | the per-member execution of `management/day40/REPLAN_TO_2026-10-31.md` (its phases C1–C4, called "REPLAN phases" here) and its acceptance date of 2026-10-31 |
| **Decision entries** | `DR-023` (Part 2b) and `DR-005` in `management/readiness/OPEN_DECISIONS.md` |
| **Work list** | `management/day51/WORK_INVENTORY.md`: every remaining item with its source, done criterion, check and status |
| **LLM QA of this record** | `management/day51/qa/QA_PR107_PR108_D51.md` (LLM QA, not a human review) |

## 1 · Why

| Fact | Value | Source |
|---|---|---|
| Team activity in this repository, 2026-10-19 → 2026-10-29 | Bế Quốc Khánh: PR #105 (revalidation rows, opened 10-19) and PR #106 (V3 QA items, opened 10-29). Nguyễn Gia Đức Trung: no own action since 2026-09-21; his 10-01 merge events are the leader's merges of his PRs. Vũ Hùng Anh: last action 2026-10-03 03:18 (+07), a branch without a PR | GitHub events and commits on all branches; checked by the LLM QA of this record. Activity in other repositories is not counted |
| 2026-10-18 | The Day 39 override day: the leader's session merged PRs up to #104 | `management/day39/RECOVERY_OVERRIDE_DAY39.md`, `DAY_LOG.md` |
| UNet family | Not trained | The last repository record (#105, 10-19: the queue dry run lists EXP-U-025/050/100 as NEW) and the leader's report on 10-30. Checkpoints and run logs stay outside git |
| Device evidence of the product app | L4 only (2026-10-01). TC-PERF-001 and the screen tour have not been run | `management/day40/ACCEPTANCE_TRACE.md` |
| MUST requirements accepted | 0 / 33 | `management/day40/ACCEPTANCE_TRACE.md`, `PROJECT_STATE.yaml` |
| REPLAN checkpoints 20/10, 22/10, 24/10, 27/10 | None met in full. One part of 20/10 was met: the Mac mini served the 74 cases | `management/day40/REPLAN_TO_2026-10-31.md`, the board |
| Mac mini | Did not answer over the overlay on 27/10 or on the evening of 30/10 | The leader's session (not a repository record) |

## 2 · Decisions and rules

| # | Item | Content | Source |
|---|---|---|---|
| 1 | **Acceptance date** | **2026-11-08**, replacing 2026-10-31 | The leader reported it at about 18:45: "thật ra lịch đã lùi xuống 8/11" (the schedule moved) |
| 2 | **Single operator** | All remaining work except the final GPU runs (the UNet family) runs through the leader's account and its Claude sessions, without per-member division | 18:41: "Bây giờ trừ phần cần GPU chạy cuối cùng, ta có thể hoàn thành toàn bộ công việc, và không cần chia cụ thể từng thành viên nữa chứ, vì mọi người sẽ cùng dùng tài khoản tôi …" |
| 3 | **Merge rule** | The session merges every PR, decision records included, after an independent LLM QA pass (recorded as LLM QA, never as a human review) and green CI. The leader reviews afterwards through `DAY_LOG.md` and the board. This explicitly renews the Day 22 / Day 39 override rule, which expired on 2026-10-18 | 21:55: "Tự merge tất cả" |
| 4 | **Ownership and TC-TEAM-001** | Each member keeps their DR-013 function for the defense: V1 Phạm Tuấn Anh, V2 Vũ Hùng Anh, V3 Bế Quốc Khánh, V4 Nguyễn Gia Đức Trung. Each evidence package states what the member built (by commit) and what agents built under the leader's account. The member must study and defend the function, and each member's TC-TEAM-001 text stays the member's own (carried over from `RECOVERY_OVERRIDE_DAY39.md` §3). The per-member revalidation tables are no longer required. *Project Control* reads this as also lifting the revalidation conditions of the Day 22 acceptances (Vũ Hùng Anh for Spikes A and C1, Nguyễn Gia Đức Trung for Spike B); Spike B's owner-authored B15 note stays due (W-E9). Where a member's own implementation is not enough for TC-TEAM-001, the shortfall is recorded as a limitation of TC-TEAM-001. PR-MOBILE-03 stays MUST, and TC-TEAM-001 stays a required test (`13` §13), so the limitation may leave it short of PASS | 21:55: "Giữ DR-013, ghi trung thực" |
| 5 | **Nothing in a member's name** | Nothing is written in a member's name that the member did not do | Carried over from `RECOVERY_OVERRIDE_DAY39.md` §3 |
| 6 | **Subjects** | Machine Learning, Image Processing, Mobile Application Development. Data Science is no longer a reporting subject. The product scope is unchanged: all 33 MUST, including the cohort and outlier features, stay and are tested | Evening: "… bỏ môn Khoa học dữ liêu đi nhé, vẫn làm đầy đủ sản phẩm, nhưng sản phẩm này tôi không dùng để báo cáo môn đó nữa" |
| 7 | **Reports and decks** | One report and one deck per subject, not rushed. *Project Control's plan:* they are written after the product is complete and the device evidence exists; the draft deck of #102 is source material only | Evening: "mỗi môn sẽ có 1 bản báo cáo + slides"; "về báo cáo và slides đừng làm vội nhé" |
| 8 | **DR-005** | **Direction:** the full 3D error map, not the 2D descope. **Spike F runs before the error-map PR merges**; the representation is approved on its evidence. The V2 branch's FP/FN error map is Spike F's candidate 1, not the decision. If no candidate passes, Option 4 (2D only) goes through `00` §13. *Project Control's plan:* Spike F's device part (F2, F7, F8, which `SPIKE_F_3D_ERROR/TASK.md` requires) runs in its own session before the merge (W-F3) | About 18:45: "Làm đầy đủ"; 21:55: "Chạy Spike F trước" |
| 9 | **UNet** | Stays with Bế Quốc Khánh; the DR-016a fallback (UNet on the leader's PC) is declined. If UNet is not trained in time, the ML report and the ML deck state the UNet vs DINOv2 question (RQ-A) as unanswered, say why, and list it as a limitation | 2026-10-27: "Để Khánh, không chạy" (option text: "Báo cáo và slide ghi UNet là hạn chế; câu hỏi UNet vs DINOv2 không trả lời được khi nghiệm thu.") |
| 10 | **Pace and care** | Quality before speed; more than a week remains; every detail made explicit; no small detail skipped. Two agents in parallel. *Project Control:* each unit is finished and verified before the next starts; one heavy job at a time on the leader's PC; the dates in §4 are latest-by dates, not targets to rush | Evening: "bạn còn hơn 1 tuần cơ nên là không cần vội đâu, tôi ưu tiên chất lượng hơn"; "… làm rõ từng chi tiết và làm thật cẩn thận, tỉ mỉ, đừng bỏ qua tiểu tiết nào"; about 18:45: "2 agent song song" |
| 11 | **Acceptance marks** | Project Control proposes a requirement for `ACCEPTED` with committed evidence (`management/day40/ACCEPTANCE_TRACE.md` §1.2) and never marks it itself; the mark is the leader's. Device evidence is taken by the leader on the target phone (DR-006a), through `mobile/scripts/device_session.ps1` and its successors | *Project Control's own rule* |
| 12 | **Working practice** | The principles of the pstack *poteto-mode* skill, which the leader asked about (the plugin is not installed), adapted to this repository: name the data shape first; prove it works on the real artifact; sequence the work into verifiable units; test behaviour, not implementation, with mutation checks on key fixes; fix root causes; explain every measured number (run count, spread, limiter); prototype an empirical fork instead of guessing | *Project Control* |
| 13 | **Repository rules (unchanged)** | No force-push; no deletion without the leader; frozen specs; no holdout access outside an authorization record; no dataset, checkpoint, IP address, serial or per-case value in git | Existing rules |

## 3 · Deviations from how the frozen specs are applied (2026-10-30 → 2026-11-08)

The spec files are not edited; their checksums stay 19/19.

| Frozen rule | How this period departs from it |
|---|---|
| `15` §7: per member, at most one primary implementation task | Two agents run in parallel under one account |
| `15` §8: a merge needs CI and at least one assigned reviewer's approval | An independent LLM QA pass takes the place of the assigned human reviewer (item 3). `main` has no branch protection on GitHub, so this rule, not a setting, keeps CI green before each merge |
| `15` §11: every task has an owner and a reviewer before implementation | The owner is the leader's session, the reviewer is the LLM QA agent |
| `13` §6 item 3: "code review passes" | The LLM QA pass plus the merge rule count as the code review, recorded as LLM QA |
| `RECOVERY_OVERRIDE_DAY39.md`: the leader may not execute another member's implementation work; DR-013 ownership returns in full on 2026-10-19 | Lifted by items 2 and 4 |

PR-MOBILE-03 stays MUST and TC-TEAM-001 stays a required test (item 4 says how they are evidenced and how a shortfall is recorded).

Item numbers in §2 are this document's own. `WORK_INVENTORY.md` cites DR-023's numbering ("DR-023 mục N").

## 4 · Plan to 2026-11-08 (latest-by dates)

| Phase | Dates | Exit |
|---|---|---|
| P1 · Product completion | 30/10 → 02/11 | 3D error map with region → slices, the pick marker and chunked transfer (V2); every open QA finding closed or recorded with a reason; #105 merged, #106 fixed and merged; Mac mini redeployed; API E2E all PASS except UNet |
| P1-F · Spike F | off-device part by 01/11; its own device session by 02/11 | The order: off-device part and harness (W-F1, W-F2) → a separate device session in Chrome on the A17 over USB, with no APK and no Mac mini (W-F3) → `RESULT.md`, and the leader approves the representation (W-F4) → the V2 branch merges (W-C1) → the final APK is built for session 2 (W-C14). F8 is re-confirmed inside the app's WebView during TC-PERF-002 in session 2 |
| P2 · Device evidence | Session 1 as soon as the Mac mini answers; session 2 on the final build by 03/11 | Session 1: TC-PERF-001 ×3 and the screen tour. Session 2: TC-PERF-002 with the error layers (it also re-confirms Spike F's F8 inside the app's WebView), TC-3D-004/005 including thin FN regions, the rest of the device TCs. One hero-flow video for TC-E2E-001 and five logged runs for TC-USAB-005 |
| P3 · Acceptance evidence | 03/11 → 04/11 | `ACCEPTANCE_TRACE.md` updated row by row; requirement → test → evidence matrix; implemented UI vs design (CLO1/CLO2) |
| P4 · Reports and decks | 04/11 → 07/11 | ML, Image Processing and Mobile: one report and one deck each, reviewed by the leader; four Mobile defense packs (CLO3) |
| Acceptance | 08/11 | — |
