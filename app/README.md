# `app/` — the product code

Day 10 of 30. Until today this repository held specifications, contracts, spikes and management records, and
no application. This directory is the application.

## What is here, and what is deliberately not

`app/core/` is a framework-neutral layer: plain `.mjs` modules, **no npm dependency, no `package.json`, no
bundler config, no React / React Native / Flutter import**. It is checked by the `app-framework-neutral` CI job.

That constraint is not taste. **`GATE-MOB-01` is still open** — Spike A and Spike B are not both `ACCEPTED`, so
`TECH_STACK_ADR.md` does not exist and no framework has been chosen. Four people need to write screens today.
If the shared layer imported a framework, the gate would be decided by whoever pushed first rather than by the
measurements, and by tonight three verticals would depend on that accident.

So `app/core` is everything a screen needs that is **not** rendering:

| Module | What it owns | Why it is shared rather than repeated |
|---|---|---|
| `contract.mjs` | loads and freezes `contracts/api/contract.json`, refuses a drifted one | 28 endpoints, 15 error codes, one geometry version — four copies would drift |
| `endpoints.mjs` | turns an endpoint id + params into a URL | the query string is baked into `path`, and the **parameter name is not the placeholder name** (`?prediction_variant={variant}`) |
| `errors.mjs` | the 15 error codes → screen state, once | this is `10` §8 in code; read this instead of re-reading the spec |
| `screenState.mjs` | the 7 states and their only constructors | four invariants hold in four verticals without four people remembering them |
| `transport.mjs` | one `call()`, validating every response against the contract | a fixture that drifts fails naming the field, not as `undefined` three components deeper |
| `fixtures/loader.mjs` | reads the generated bundle, enforces `FORMAT.md` | the handshake with Trung's generator |
| `node/loadFromDisk.mjs` | **the only file that touches the filesystem** | on a device the contract is a bundled asset; how it is read depends on the framework |
| `viewMath.mjs` | zoom / pan / screen→source | a **copy** of Spike A's measured code, with a provenance header |
| `cacheKey.mjs` | per-slice cache keys (DR-015) | the ways a cache can lie are all naming mistakes |
| `selection.mjs` | reads a worst-slice selection — **never ranks** | DR-010: the API returns the selection, the client never re-derives it |
| `comparability.mjs` | reads `comparable` — **never decides** | `11` §5: the client must not label a comparison fair when the contract says false |

## Running it

```bash
node app/core/tests/run_all.mjs          # 10 scripts, no dependency to install
```

To fill in real fixture data, generate the bundle first:

```bash
python -c "import json,sys; sys.path.insert(0,'contracts/api'); \
from generate_fixture import generate_fixture; \
json.dump(generate_fixture(json.load(open('contracts/api/contract.json'))), \
open('app/core/fixtures/.generated/api_bundle.json','w'), indent=2)"
```

The bundle is **gitignored**: `fixture_rules.handwritten_fixtures_allowed` is `false`, so a committed bundle
would be a fixture nobody can prove was generated. Without it every screen shows `EMPTY_UNAVAILABLE` with
reason `FIXTURE_SCENARIO_MISSING` — which is a working screen, and it lights up with no code change the moment
the scenarios land.

## The four verticals

Each person owns a directory and branches **from the `app/core` branch**, not from `main`, so nobody waits for
a merge.

| | Owner | Screens | Directory |
|---|---|---|---|
| **V1** | Phạm Tuấn Anh | `SCR-03` Case Explorer / 2D MRI Inspector, `SCR-04` Error Inspector | `app/verticals/v1_case_explorer/` |
| **V2** | Vũ Hùng Anh | `SCR-05` 3D Inspector | `app/verticals/v2_3d_inspector/` |
| **V3** | Nguyễn Duy Khánh | `SCR-01` Study Overview, `SCR-07` Experiment Comparison | `app/verticals/v3_study_and_compare/` |
| **V4** | Nguyễn Gia Đức Trung | `SCR-06` Review / Correction, `SCR-08` Findings | `app/verticals/v4_review_and_findings/` |

Each directory has a README naming the endpoints that vertical calls, the error codes it must handle, and the
core functions that already do the work. Read your own before writing a line.

## Rules that are not negotiable while the gate is open

1. **No framework import, no npm dependency, no `package.json` under `app/`.** CI refuses them.
2. **No import from `spikes/**`.** Spike code is labelled throwaway. Reuse is by copy with a provenance header
   — see the top of `viewMath.mjs`.
3. **Node builtins only under `app/core/node/`** (and the tests). A device bundle has no `node:fs`.
4. **`app/core/index.mjs` never re-exports `node/loadFromDisk.mjs`.** Test `D5` enforces it.
5. **Never invent contract values.** If the contract does not say it, the screen says it is unavailable.
