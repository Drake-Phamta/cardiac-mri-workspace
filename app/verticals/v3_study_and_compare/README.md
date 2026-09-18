# V3 — Study Overview (`SCR-01`) and Experiment Comparison (`SCR-07`)

**Owner: Nguyễn Duy Khánh.** Branch from the `app/core` branch, not from `main`.

## Endpoints this vertical calls

| Screen | Endpoint id | Notes |
|---|---|---|
| `SCR-01` | `study_get` | `case_counts`, `capabilities`, `experiment_summary` |
| `SCR-01` | `case_list` | **list endpoint** — `items`, `next_page`, `mode` |
| `SCR-07` | `experiment_list` | list endpoint |
| `SCR-07` | `experiment_get` | the full provenance row: split manifest, preprocessing/postprocessing, checkpoint, evaluation version |
| `SCR-07` | `experiment_metrics` | `evaluation_n` **and** `successful_n` — they are not the same number |
| `SCR-07` | `experiment_cases` | list endpoint; failed/excluded cases stay visible with `status` and `reason` |
| `SCR-07` | `experiment_compare` | `?ids={experiment_ids}` — **parameter is `ids`, token is `experiment_ids`** |

`experiment_compare` takes an array: `client.call('experiment_compare', { experiment_ids: ['EXP-U-100',
'EXP-D-100'] })` → `/api/v1/experiments/compare?ids=EXP-U-100,EXP-D-100`. Core joins and escapes; do not build
that string.

## List endpoints and the row rule

For `case_list`, `experiment_cases` (and `reviewed_masks_list`, `findings_list` in V4) the contract lists row
fields alongside top-level ones. Core accepts a field as present if it is at the top level **or** on **every**
element of `items` — a field on only some rows is refused. That is what stops a half-populated list from
rendering with blank cells.

## The one rule that makes or breaks `SCR-07`

`11` §5: **"The client must not label a comparison as fair/comparable when this contract says false."**

```js
import { readComparability, presentation } from '../../core/index.mjs';

const c = readComparability(view.data);
const p = presentation(c);
// p.mayShowSideBySide  always true  — the two sets of numbers are real either way
// p.mayShowDelta       only if fair — a difference between unlike populations is meaningless
// p.mayLabelFair       only if fair
// p.mustShowReason     when not fair — render p.reason, do not swallow it
```

Note the third case: a response whose `comparable` is **missing or not a boolean** is `UNDECIDED`, and
`UNDECIDED` is not comparable. Defaulting an absent flag to `true` is how an unfair comparison gets labelled
fair by a typo, and the chart looks perfect while it does it.

Never compute comparability yourself from `split_manifest_id` and friends, even though `experiment_get`
returns all of them. The server decides; this screen reports.

## Error codes you must handle

`ARTIFACT_NOT_FOUND` · `NON_COMPARABLE_EXPERIMENTS` · `GROUND_TRUTH_UNAVAILABLE` · `VALIDATION_ERROR` ·
`UNAUTHORIZED`

`NON_COMPARABLE_EXPERIMENTS` resolves to `EMPTY_UNAVAILABLE` with **no action** — there is nothing the user
can do about it, and offering a retry would suggest otherwise.
