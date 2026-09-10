# Day-0 Git drill — practice area

This directory exists for exactly one purpose: the **Git / PR / evidence drill** in the 14:30 session of
[../DAY0_KICKOFF_RUNBOOK.md](../DAY0_KICKOFF_RUNBOOK.md).

Nothing here is production code and nothing here is spike evidence. These files carry no scientific or
engineering meaning; no requirement, acceptance test, or gate references them. They exist so that every
member can rehearse the real workflow on a change that cannot break anything.

---

## Hard boundary

A drill branch must **not** touch:

- production implementation
- `docs/specs/v1.0/` — Frozen Specification v1.0
- `management/spikes/**` — spike tasks, state, or evidence
- `management/readiness/**` — the readiness and decision record

**Reviewer's first check:** run `git diff --name-only main...<branch>`. If any path falls outside
`management/onboarding/practice/`, request changes immediately and do not review the content.

---

## Cross-review pairing

| Author | Reviewer |
|---|---|
| Phạm Tuấn Anh | Vũ Hùng Anh |
| Vũ Hùng Anh | Phạm Tuấn Anh |
| Bế Quốc Khánh | Nguyễn Gia Đức Trung |
| Nguyễn Gia Đức Trung | Bế Quốc Khánh |

Each person must finish the drill having **received** a `NEEDS_FIX` and **given** one. A self-posted
comment is not a received review, and GitHub does not permit approving your own pull request — so the
drill is only complete when your pair has genuinely taken part.

---

## Required fields in a practice file

A practice file is complete only when **all** of these are filled in with the author's own words:

1. Role
2. Mobile vertical (V1 / V2 / V3 / V4) and what it does
3. Technical block and where it sits on the pipeline
4. Current spike
5. Spikes I review, in priority order
6. Where I escalate a conflict between two frozen spec files, and what I must open
7. **Reviewer** — the name of the person reviewing this file, per the pairing table above

Field 7 is not pre-printed in the stub files, so it is the field most often forgotten — but a missing
field is only worth a `NEEDS_FIX` **if it is actually missing**.

### Review honestly

| Rule |
|---|
| Request changes **only for a genuine defect** — something wrong in the PR as the author submitted it |
| A PR that is correct on arrival is **approved**, immediately |
| **Never plant a defect** so that you have something to reject |
| **Never push into another member's branch** to create or fix a finding — say it in the review, let the author fix it |
| Never invent a review comment to satisfy a checklist |

The drill exists to prove you can run a **legitimate** PR and review cycle, not to produce a rejection.
An approval on a correct PR is a complete, successful drill.

---

## Commands

Replace `<slug>` with your own (`tuan-anh`, `hung-anh`, `quoc-khanh`, `duc-trung`) and `<FILE>` with your
own practice file.

**Author — open the pull request**

```bash
git switch main
git pull --ff-only origin main
git switch -c chore/practice-<slug>
# edit management/onboarding/practice/<FILE>
git add management/onboarding/practice/<FILE>
git commit -m "chore(practice): PRACTICE-01 add role summary"
git push -u origin chore/practice-<slug>
gh pr create --base main --title "chore(practice): PRACTICE-01 add role summary" \
  --body "Day-0 Git drill. Practice file only."
```

**Reviewer — request one change, then approve after the fix**

```bash
gh pr diff <n> --name-only          # boundary check first
gh pr review <n> --request-changes -b "NEEDS_FIX: <the specific missing item>"
# after the author pushes the fix
gh pr review <n> --approve -b "APPROVE: fields complete, diff stays inside practice/"
```

**Author — squash merge once approved**

```bash
gh pr merge <n> --squash --delete-branch
```

---

## Why the commit message carries an ID

`chore(practice): PRACTICE-01 …` mirrors the real convention: every commit is traceable to a task or
finding ID. `PRACTICE-01` is a stand-in with no meaning outside this drill — on real work the ID is a
spike task, a requirement, or a finding.
