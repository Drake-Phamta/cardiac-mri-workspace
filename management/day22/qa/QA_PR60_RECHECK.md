# QA: PR #60 `feat(ml)`: data loader and model definitions · **MERGE at `6381475`** (PASS WITH FIXES, non-blocking only) · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| Item | Value |
|---|---|
| Reviewer | **CHAT E, independent QA. This is an LLM session (Claude, `claude-opus-5-5`) running under the team leader's account, not a second human reviewer.** I did not author or edit the PR. |
| Target | PR #60, branch `feat/ml-data-models`. **Round 1** reviewed `e54f2616db92f93bc56702a1a58c0ee764d44b14` and its pure rebase `d5c04bc71074ebaf757740e4785e8fd387177bdf`; their `ml/` tree is identical (`b304099d…`) and `git diff e54f2616 d5c04bc -- ml .gitignore` is empty. **Round 2** reviewed the fix delta at **`6381475ce66c43ded12d93ca0c43d52db260cd82`**, which is `d5c04bc` plus one fix commit (+253/-28 lines). |
| Baseline | Merge-base `f5aa763`. `origin/main` was `44350d4` at round 2. Copied sources at `896c11a`: `probe.py`, `dr011_normalization.json`. Split manifest sha256 `c5c65a09…396d`, verified. |
| Method | My own worktree, detached. Local merges with `git merge --no-commit`, then `--abort`; nothing committed, pushed or posted. Scratch is `%TEMP%\claude\qa60` (outside git). Real data: 2 TRAIN cases from the 25% effective subset, CASE_0059 (640×640×88) and CASE_0079 (576×576×88). A Python audit hook blocked `open()` under all 76 validation, holdout and excluded case directories. Bypass and hardlink demonstrations used the synthetic package only. |
| Ran | 11:20–11:42 (round 1), 11:57–12:03 (round 2), +07 |
| Data access | Only the 2 TRAIN case directories were opened (4 files). 0 forbidden opens. Nothing derived is in any work tree; my worktree is clean at `6381475`. |
| GPU | Round 1: about 1–2 s of CUDA context initialisation, no kernels (PowerShell drops `CUDA_VISIBLE_DEVICES=""`). Round 2: 0 s. |

> **Publishing note (F5 / DR-002b):** rows 3 and 5 contain per-case derived values for 2 TRAIN cases. Strip them before this text goes into the public repo.

## Checks (final state at `6381475`)

| # | Check | Command | Result | Evidence |
|---|---|---|---|---|
| 1 | Tests | `python -m pytest ml/tests -q -p no:cacheprovider` | **PASS** | `e54f261`: 32 passed, 1 skipped. `d5c04bc`: 33 passed. **`6381475`: 49 passed.** **Merge of `6381475` with `44350d4`** (clean, tree `9b46613`): **49 passed.** |
| 2 | Fail-closed access | `s04_realdata.py` | **PASS** (R1 remains) | **38 refusal attempts, all refused with 0 files opened.** They cover holdout ids (one, all 54, mixed with train), CASE_0117 and CASE_0133, unknown and lowercase ids, and bare `str`/`bytes`. `allow_holdout=1`, `"True"` and `np.True_` → `TypeError`. A plain list, string or set into `case_paths`/`SliceDataset` is refused. Validation, holdout and excluded ids are refused through `CasePaths`, `load_case` and `build_cache`. A forged sidecar with `partition: final_holdout` → `HoldoutAccessError`, and a forged `case_id` is refused. `..`, absolute and drive manifest paths are refused. `for_training("25_percent")` gives exactly the 20 effective ids, in order. `for_validation` admits 20 by design. **At `6381475`** an in-root `..` alias is now refused, and a plain dict into the loaders → `TypeError` (N1). `case_paths` on the real manifest for the 25/50/100% allowlists gives 20/38/78 cases with no false refusals. |
| 3 | DR-011 parity | `s04` | **PASS** | On both cases, max\|ml − probe.py@896c11a\| = **0** (bit-identical). Against the spec in float64 (numpy `linear` percentiles, clip, scale): 2.9e-8. Output is float32 in exactly [0, 1]. p0.5/p99.5 = 0/78 and 0/50. Re-confirmed at `6381475`. |
| 4 | Axes and geometry | `s04` | **PASS** | `to_nrrd_order(to_zyx(x)) == x` bit for bit, as a view. `write_mask_nrrd` round trip on CASE_0059: voxels and the geometry keys (`space`, `space directions`, `space origin`, `kinds`) are preserved; sha256 equals hashlib; a rewrite raises `FileExistsError`. Masks go from {0, 255} to {0, 1} with equal counts. |
| 5 | Resizing | `s04` | **PASS** | Image resize: bilinear with antialias on (it differs from no-antialias by up to 0.096). Mask resize: `nearest-exact`, values {0, 1} only. Logits: bilinear back to native size, then thresholded there; the round-trip Dice is 0.9926 and 0.9954. **Foreground fraction native → 560:** CASE_0059 0.004057 → 0.004057; CASE_0079 0.002914 → 0.002916. |
| 6 | Cache | `s04` | **PASS** | The sidecar's NRRD sha256 equals Python hashlib, and the `.npy` hashes match. The second call reuses the cache. A cache dir inside git is refused and not created. `SliceDataset(verify_hashes=True)` has length 176 and yields `[1,560,560]` float32 for x and y. A tampered `.npy` is caught. `DataLoader(num_workers=2)` on Windows works. Re-confirmed at `6381475`. |
| 7 | Models | `s02_diff.py`, `s06_models.py`, test review | **PASS at `6381475`** (round-1 FAIL, B1) | `UNet2D`, `_rss` and `DINO_CHECKPOINTS` are identical to probe; `DinoSeg` and `PeakTracker` match except for docstrings. A CPU forward of `[1,1,560,560]` gives `[1,1,560,560]` for both ADR-ML-001 variants. Parameter counts are 4,619,777 and 22,294,849, matching the C0 evidence. `output_stride` is 1.0 and 1.75. Wrong revisions raise (`0`×40, `main`, the other repo's commit, a patched pin); nothing is downloaded. `model_card` has no local path and revision `ed25f3a…`. **B1 fixed:** `_device_kind` is applied in `autocast_for` and `PeakTracker`, with tests covering all 4 CUDA spellings for bf16 and fp16. |
| 8 | Publication hygiene | Grep of the squash diff `f5aa763..6381475` for drive paths, UNC, `Users\`, `AppData`, `02_Research`, IPv4 and e-mail | **PASS at `6381475`** (round-1 FAIL, B2) | The only hits are fake refusal-test inputs (`"C:/abs/…"`). From the linked worktree, `main_checkout_root()` gives `<repo>`; the package root exists and the cache is outside git. There is a regression test for env-var, relative and absolute gitdir, submodule and no `.git`. **The squash merge keeps the old paths out of main's history.** |
| 9 | Diff contents | `git diff --numstat f5aa763 6381475` | **PASS** | 10 text files, 0 binary. Test data is generated at test time. No `.npy` or `.npz` files are tracked on main, so the new ignores hide nothing. |
| 10 | C1 hardlink layout (added in round 2) | `s09_hardlink_c1.py` (synthetic) | **PASS** | SYN_0001 and SYN_0002 are hardlinked into `<tmp>/root/<CASE_ID>/{lgemri,laendo}.nrrd` (st_nlink=2, samefile, not symlinks). I tested a view with only those cases and a view with all cases where only they are rewritten to `<CASE_ID>/<file>`. Both are accepted: `resolve()` keeps the hardlink path, `load_case` is identical to the original package, `build_cache` and `SliceDataset(verify_hashes=True)` work, and the sidecar records `SYN_0001/lgemri.nrrd`. |

## Findings

### BLOCKING: both raised in round 1, both RESOLVED at `6381475`
- **B1.** `autocast_for` silently ran fp32 for `"cuda:0"` and `torch.device("cuda")`, a regression against probe.py. `PeakTracker` made the same string comparison. **Fixed** with `torch.device(device).type`, marked CHANGED, plus CPU tests that monkeypatch `torch.autocast`.
- **B2.** Absolute `<d>\…` paths in 6 committed lines. **Fixed** with `CARDIAC_DATA_ROOT`, falling back to `cardiac-data` next to the main checkout (found through the linked worktree's `gitdir:`), placeholders in the docs and `.gitignore`, and a drive-path regression test.

### NON-BLOCKING (open; owner: PR author / Bế Quốc Khánh)
- **R1. Residual from N3.** The claims check compares path text, so Windows path normalisation still allows aliasing. A tampered entry such as `"Testing Set./<hash>/lgemri.nrrd"`, `"Testing Set /…"` or `"…/lgemri.nrrd."` made a TRAIN id load the holdout MRI (synthetic demo; a plain alias is refused). **Fix:** one line in `_inside` after `resolve()`: refuse unless `_path_key(os.path.relpath(p, root.resolve())) == _path_key(rel)`. That also rejects 8.3 short names and junction redirects, and it stays compatible with C1 hardlinks, which resolve to themselves.
- **N2.** The loaders do not verify the split sha256 (`c5c65a09…`) or `split.source_dataset_manifest.sha256` (`f64d461f…`) at run time; only the test pins the split sha.
- **N4.** Cache reuse depends on a hand-bumped `PREPROCESSING_VERSION`. Run C1 with `verify_hashes=True`.
- **N5.** Partly done. The B1 changes are marked; `SystemExit`→`RuntimeError` and the `_dr011` refactor remain unmarked (behaviour-neutral).
- **Minor.** The drive-path test does not scan `ml/tests/*.py`; that is by design, because those files contain fake drive paths. `_have()` turns any DINOv2 load error into a skip.
- **Resolved:** N1 (`isinstance(CasePaths)` in all loaders), N3 at text level (`..`, absolute, rooted, drive and UNC paths, cross-claims, MRI == mask), N6 (sha pin, CASE_0117/CASE_0133 refused, 25% equals the effective ids, README updated).

## VERDICT

**MERGE at `6381475ce66c43ded12d93ca0c43d52db260cd82` (squash).** Both blocking findings are fixed and verified. All 10 checks pass on the head and on a merge with current main. Only non-blocking items remain, and R1 is a one-line fix.

For C1: every CUDA spelling now gets bf16 and a true CUDA peak, and the hardlink view (`<CASE_ID>/<file name>` under a hardlink root) is accepted by the new path checks.

Scratch: `<qa-scratch>\`, outside git. It holds the scripts `s01`–`s10`, the logs, derived arrays for the 2 TRAIN cases, and the synthetic and hardlink packages. Delete it when you're done.
