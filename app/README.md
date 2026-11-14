# `app/` — shared client logic

`app/core/` is a framework-neutral layer: plain `.mjs` modules, **no npm dependency, no `package.json`, no
bundler config, no React / React Native import**. The mobile app in `mobile/` imports it (Metro bundles
`../app/core` directly), and every module can be tested with plain `node`, without a phone or an emulator. The
`app-framework-neutral` CI job keeps it that way.

Why neutral: the four verticals had to start before the mobile framework was chosen, and keeping rendering out of
the shared layer means the logic (contract, states, view math, selections) is tested once and used by every screen.

`app/core` is everything a screen needs that is **not** rendering:

| Module | What it owns | Why it is shared rather than repeated |
|---|---|---|
| `contract.mjs` | loads and freezes `contracts/api/contract.json`, refuses a drifted one | 28 endpoints, 15 error codes, one geometry version — four copies would drift |
| `endpoints.mjs` | turns an endpoint id + params into a URL | the query string is baked into `path`, and the **parameter name is not the placeholder name** (`?prediction_variant={variant}`) |
| `errors.mjs` | the 15 error codes → screen state, once | this is `10` §8 of the spec in code |
| `screenState.mjs` | the 7 states and their only constructors | four invariants hold in four verticals without four people remembering them |
| `transport.mjs` | one `call()`, validating every response against the contract | a fixture that drifts fails naming the field, not as `undefined` three components deeper |
| `fixtures/loader.mjs` | reads the generated bundle, enforces `FORMAT.md` | the handshake with the fixture generator in `contracts/api/` |
| `node/loadFromDisk.mjs` | **the only file that touches the filesystem** | on a device the contract is a bundled asset |
| `viewMath.mjs` | zoom / pan / screen→source | a **copy** of the 2D prototype's measured code, with a provenance header |
| `cacheKey.mjs` | per-slice cache keys | the ways a cache can lie are all naming mistakes |
| `selection.mjs` | reads a worst-slice selection — **never ranks** | the API returns the selection; the client never re-derives it |
| `comparability.mjs` | reads `comparable` — **never decides** | `11` §5: the client must not label a comparison fair when the contract says false |

## Running the tests

The tests need the generated fixture bundle (gitignored; `fixture_rules.handwritten_fixtures_allowed` is `false`,
so a committed bundle would be a fixture nobody can prove was generated). Generate it from the contract, then run
the tests, from the repository root:

```powershell
python -c "import json,sys,os; sys.path.insert(0,'contracts/api'); from generate_fixture import generate_fixture; os.makedirs('app/core/fixtures/.generated', exist_ok=True); json.dump(generate_fixture(json.load(open('contracts/api/contract.json', encoding='utf-8'))), open('app/core/fixtures/.generated/api_bundle.json','w', encoding='utf-8'), indent=2)"
node app/core/tests/run_all.mjs                                          # 10 scripts
node app/verticals/v1_case_explorer/test_case_explorer.mjs
node app/verticals/v3_study_and_compare/test_study_and_compare.mjs
node app/verticals/v4_review_and_findings/test_review_correction.mjs
node app/verticals/v4_review_and_findings/test_brush.mjs
node app/verticals/v4_review_and_findings/test_findings.mjs
```

Without the bundle every screen shows `EMPTY_UNAVAILABLE` with reason `FIXTURE_SCENARIO_MISSING`.

## The four verticals

Each vertical keeps its framework-free model and tests here; its screens are in `mobile/src/verticals/v<N>/`.

| | Owner | Screens | Directory |
|---|---|---|---|
| **V1** | Phạm Tuấn Anh | `SCR-03` Case Explorer / 2D MRI Inspector, `SCR-04` Error Inspector | `app/verticals/v1_case_explorer/` |
| **V2** | Vũ Hùng Anh | `SCR-05` 3D Inspector | `app/verticals/v2_3d_inspector/` |
| **V3** | Bế Quốc Khánh | `SCR-01` Study Overview, `SCR-07` Experiment Comparison | `app/verticals/v3_study_and_compare/` |
| **V4** | Nguyễn Gia Đức Trung | `SCR-06` Review / Correction, `SCR-08` Findings | `app/verticals/v4_review_and_findings/` |

Each directory has a README naming the endpoints that vertical calls, the error codes it must handle, and the
core functions that already do the work.

## Rules

1. **No framework import, no npm dependency, no `package.json` under `app/`.** CI refuses them.
2. **No import from `prototypes/**`.** Prototype code is not product code. Reuse is by copy with a provenance
   header — see the top of `viewMath.mjs`.
3. **Node builtins only under `app/core/node/`** (and the tests). A device bundle has no `node:fs`.
4. **`app/core/index.mjs` never re-exports `node/loadFromDisk.mjs`.** Test `D5` enforces it.
5. **Never invent contract values.** If the contract does not say it, the screen says it is unavailable.
