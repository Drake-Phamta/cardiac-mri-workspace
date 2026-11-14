# QA: PR #60 `feat(ml)`: data loader and model definitions · **REJECT** (2 blocking findings, both small mechanical fixes) · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| Item | Value |
|---|---|
| Reviewer | **CHAT E, independent QA. This is an LLM session (Claude, `claude-opus-5-5`) running under the team leader's account, not a second human reviewer.** I did not author or edit the PR. |
| Target | PR #60, branch `feat/ml-data-models`. **Reviewed at `e54f2616db92f93bc56702a1a58c0ee764d44b14`.** During the review the remote branch moved to `d5c04bc71074ebaf757740e4785e8fd387177bdf`. That is a pure rebase onto `f5aa763`: `git range-diff` shows `=`, and its tree `b2b06ca` is identical to my local merge of `e54f261` with `f5aa763`. **Every finding applies to `d5c04bc` unchanged.** |
| Baseline | Parent `771ddb3`. Merge targets: `origin/main` = `f5aa763` (review start) and `8a94172` (after #41/#44 merged at 11:31). Copied sources at `896c11a`: `probe.py`, `dr011_normalization.json`. Split manifest sha256 `c5c65a09…396d`, verified; git blob and worktree bytes are identical (LF, no BOM). |
| Method | My own worktree `.claude/worktrees/agent-a6147e5d7675b603f`, detached at the target. Local merges with `git merge --no-commit --no-ff`, then `--abort`; nothing committed, pushed or posted. Scripts and outputs are only in `%TEMP%\claude\qa60\` (outside git). Real data: 2 TRAIN cases from `25_percent.effective_case_ids`, one per in-plane size: **CASE_0059** (640×640×88) and **CASE_0079** (576×576×88). A Python audit hook blocked any `open()` under the 76 validation, final_holdout or training-excluded case directories and logged every open under the package root. |
| Ran | 11:20–11:42 (+07) |
| Data access | Exactly 4 files were opened under the package root, all in the 2 TRAIN case directories. 0 forbidden opens were attempted or blocked. No validation or holdout byte was read. Nothing derived is in any work tree (`git status --ignored` is clean; the main checkout is untouched). |
| GPU | About 1–2 s. PowerShell drops `CUDA_VISIBLE_DEVICES=""`, so constructing `torch.autocast('cuda', bf16)` objects in check 7 initialised a CUDA context. No kernels ran and no tensors went to the GPU. Everything else ran on CPU. |

> **Publishing note (F5 / DR-002b, as in QA-003):** rows 3 and 5 contain per-case derived values (percentile bounds, foreground fractions) for 2 TRAIN cases, because the brief asked for them. Strip them before this text goes into the public repo.

## Checks

| # | Check | Command | Result | Evidence |
|---|---|---|---|---|
| 1 | Tests | `python -m pytest ml/tests -q -p no:cacheprovider` on the head, then after `git merge --no-commit origin/main` | **PASS** | Head `e54f261`: **32 passed, 1 skipped** (the real-split test; manifest not on branch). Merge with `f5aa763` (tree `b2b06ca` = `d5c04bc`): **33 passed**. Merge with current `8a94172` (tree `de92a9f`, no overlap with `ml/`, `.gitignore` or manifests): **33 passed**. Both merges are clean. The DINOv2 tests ran, not skipped. |
| 2 | Fail-closed access | `s04_realdata.py` | **PASS** (gaps N1–N3) | **38 attempts, all refused with the expected exception and 0 package files opened:** holdout id, all 54 holdout ids, holdout mixed with train, CASE_0117, CASE_0133, excluded mixed with train, unknown id, lowercase id, bare `str` and `bytes` → `TypeError`. `allow_holdout=1`, `"True"`, `np.True_` (both on `__init__` and `for_holdout`) → `TypeError`. `for_holdout(False)` → `HoldoutAccessError`. Plain list, bare string or `set` into `case_paths` / `SliceDataset` → `TypeError`. Validation, holdout and excluded ids through `CasePaths[...]`, `load_case` and `build_cache` (9 calls) are refused, and a mixed `build_cache` fails before any work. A forged sidecar with `partition: final_holdout` → `HoldoutAccessError`; a forged sidecar `case_id` → `ValueError`. Manifest path `../../../../Windows/win.ini` → `ValueError` (escapes root); `C:/Windows/win.ini` → `ValueError`. `for_training(split,"25_percent")` gives **exactly the 20 effective ids, in order**; 50% gives 38 and 100% gives 78, none of them holdout, validation or excluded. `for_validation` admits 20 ids by design (constructed only, no I/O). The real manifest uses `training_exclusions.all_excluded_case_ids`, the same key the code reads. |
| 3 | DR-011 parity | `s04` | **PASS** | On both cases, **max\|ml − probe.py@896c11a\| = 0** (bit-identical; probe normalises the xyz volume and takes slice `norm[:,:,k].T`). Against the spec JSON (float64 numpy percentile with `linear` interpolation, clip, scale): max\|Δ\| = 2.9e-8 and 2.86e-8. Output is float32 with range exactly [0, 1]. p0.5/p99.5 = 0/78 (CASE_0059) and 0/50 (CASE_0079). `info.mri_sha256` equals hashlib of the file. |
| 4 | Axes and geometry | `s04` | **PASS** | `to_nrrd_order(to_zyx(x)) == x` bit for bit and as a view, on real volumes. `load_mask == to_zyx(raw > 0)`. `write_mask_nrrd` round trip on CASE_0059: voxels equal the source mask > 0, and `space`, `space directions`, `space origin` and `kinds` are preserved (the source has no other geometry keys). Its sha256 equals hashlib, and a rewrite raises `FileExistsError`. Source masks hold only {0, 255} and become {0, 1} (count of 255 equals count of 1, for both cases). |
| 5 | Resizing | `s04` | **PASS** | The image resize is identical to torch bilinear with `antialias=True` (it differs from no-antialias by up to 0.096 and 0.032, so antialias is on). The mask resize is identical to `nearest-exact`, with values {0, 1} only. `resize_logits_back` is identical to torch bilinear with `align_corners=False`; thresholding happens at native resolution. Round trip of the resized mask through logits and back gives Dice 0.9926 and 0.9954 against the native mask (no shift or flip). **Foreground fraction native → 560:** CASE_0059 0.004057 → 0.004057 (×1.0001); CASE_0079 0.002914 → 0.002916 (×1.0007). |
| 6 | Cache | `s04` | **PASS** | `build_cache` at img 560 with `native_mask=True` took 2.8 s for 2 cases. The sidecar's MRI and mask sha256 **equal Python hashlib of the files**, and the `.npy` hashes match. The second call reuses both cases (0.2 s). A cache dir in this worktree or in the main work tree is refused with `ValueError` and never created; the default cache root is outside git. `SliceDataset(verify_hashes=True)`: length 176 (88+88), x and y are `[1,560,560]` float32, y ∈ {0, 1}, and `native_mask` has shape (88, 576, 576). A tampered `.npy` is caught with `verify_hashes=True`. `DataLoader(num_workers=2)` on Windows (spawn) delivered 64 samples in 4.4 s with batch shape `(4,1,560,560)`. float16 quantisation is at most 2.44e-4. |
| 7 | Models | `s02_diff.py` (ast diff against `git show 896c11a:…/probe.py`), `s06_models.py` | **FAIL** (B1; everything else passes) | `UNet2D`, `_rss` and `DINO_CHECKPOINTS` are **identical**. `DinoSeg` and `PeakTracker` differ only by an added docstring line. `fetch_checkpoint` and `autocast_for` carry CHANGED marks. Small unmarked deltas are listed in N5. Both ADR-ML-001 variants construct, and a CPU forward of `[1,1,560,560]` gives logits `[1,1,560,560]` (UNet 0.4 s; DINOv2 0.6 s). Parameter counts are 4,619,777 and 22,294,849 (all trainable, so full fine-tune), and **both match the C0 evidence at `896c11a`**. `output_stride`: UNet 1.0; DinoSeg 1.75 (40×40 tokens, decoder to 320, interpolated ×1.75; documented). Wrong revisions raise: `"0"*40` and the b14 commit raise `LocalEntryNotFoundError` with no download even with `HF_HUB_OFFLINE` unset; `"main"` raises `RuntimeError` ("resolved to ed25f3a…"); a patched `PINNED_REVISIONS` makes `build_model` raise. `model_card` has all fields, the revision resolves to `ed25f3a…`, weights sha256 `ae1e99fc…`, and there is no `_path` or local path. The same seed gives the same DINOv2 decoder init. **But `autocast_for` silently drops bf16 for `"cuda:0"` and `torch.device("cuda")`; see B1.** |
| 8 | Publication hygiene | `git diff 771ddb3 e54f261` grep for drive letters, UNC paths, `Users\`, `AppData`, IPv4 addresses, e-mails and hostnames | **FAIL** (B2) | No hostnames, IPs, usernames or e-mails. **6 added lines carry `<d>\…` paths.** |
| 9 | Diff contents | `git diff --numstat`, `git ls-tree -r origin/main` filtered for binaries | **PASS** | 9 text files, +1,940 lines, 0 binary files. Test data is generated at test time (`synth.py`). No `.npy`, `.npz`, `.pt`, `.safetensors` or `.nrrd` files are tracked on main, so the global `*.npy`/`*.npz` ignore hides nothing, and `ml/**/cache/` and `ml/**/predictions/` make sense. The comment block has absolute paths (B2). |

## Findings

### BLOCKING

**B1. `autocast_for` silently runs fp32 on any CUDA device not spelled exactly `"cuda"`.**
- **Evidence.** `autocast_for(d, "bf16")` returns `nullcontext` for `"cuda:0"`, `torch.device("cuda")` and `torch.device("cuda", 0)`, because `torch.device("cuda") == "cuda"` is `False`.
- **It is a regression.** probe.py@896c11a ignored `device` and returned `torch.autocast` for every non-fp32 call. The CHANGED line `if precision == "fp32" or device != "cuda"` is what introduces the problem, and its stated justification (keep CPU tests out of CUDA autocast) does not cover CUDA devices. `PeakTracker` (unchanged from probe) does the same exact-string test, so `PeakTracker(torch.device("cuda"))` reports a CPU RSS delta instead of `max_memory_allocated`.
- **Impact.** With the common idiom `device = torch.device("cuda" if …)`, C1 and every training run would execute fp32 while the run records say bf16, with no error. That gives wrong peak-memory and batch-ceiling numbers for the 4 GiB feasibility decision, and a silent deviation from the pre-declared ADR-ML-001 recipe.
- **Fix (about 5 lines).** Use `kind = torch.device(device).type` in `autocast_for` and in `PeakTracker.__init__`. Add a CPU-only test that factors out a `_device_kind()` helper (or monkeypatches `torch.autocast`) and asserts that `"cuda"`, `"cuda:0"` and `torch.device("cuda", 0)` all map to `cuda`. Mark it CHANGED vs probe.py.
- **Owner:** the PR #60 author (recovery-override agent); adopted by Bế Quốc Khánh.

**B2. Machine-specific absolute paths in committed files (public repo).**
- **Where.** `ml/data.py` lines 42, 69 (`DEFAULT_PACKAGE_ROOT = <data-root>`), 70 (`DEFAULT_CACHE_ROOT = <data>\cache`) and 643; `ml/README.md` line 36; the `.gitignore` comment (`…\cache\`, `…\cardiac-runs\`).
- **Assessment.** Sensitivity is low: there is no account name or host, and the repo path already appears in 2 Day-20 docs on main. But the paths break the stated rule. They also contradict the project's own redaction: `dataset_manifest.json` publishes `package_root` as "EXTERNAL PRIVATE ARCHIVE" (QA-002 F5).
- **On the suggested `REPO_ROOT.parent` default.** It only works from the main checkout. From a linked worktree (`.claude/worktrees/<name>`, `scratchpad/wt-*`), `REPO_ROOT.parent` is `…\.claude\worktrees`. The package root would then be missing, and the cache default would land inside the main work tree, where it would be refused. That fails closed, but it is unusable.
- **Minimal fix.**
  ```python
  def _data_root() -> Path:
      if os.environ.get("CARDIAC_DATA_ROOT"):
          return Path(os.environ["CARDIAC_DATA_ROOT"])
      main, git = REPO_ROOT, REPO_ROOT / ".git"
      if git.is_file():   # linked worktree: "gitdir: <main>/.git/worktrees/<name>"
          main = (REPO_ROOT / git.read_text(encoding="utf-8").split(":", 1)[1].strip()).resolve().parents[2]
      return main.parent / "cardiac-data"
  DEFAULT_PACKAGE_ROOT = Path(os.environ.get("CARDIAC_PACKAGE_ROOT", _data_root() / "lasc2018" / "extracted"))
  DEFAULT_CACHE_ROOT = Path(os.environ.get("CARDIAC_CACHE_ROOT", _data_root() / "cache"))
  ```
  Write `<CARDIAC_DATA_ROOT>\cache\<split_id>\img<img>\` in the docstrings, README and `.gitignore` comment.
- **Keep it out of history.** PRs merge with merge commits, so a follow-up commit would still bring `e54f261`/`d5c04bc` into main's history. Amend the single commit and force-push (the branch has already been force-pushed once), or squash-merge.
- **Owner:** the PR #60 author.

### NON-BLOCKING
All demonstrations below used the synthetic package only.

- **N1. `load_image`, `load_mask` and `load_case` accept any mapping.** A plain `{holdout_id: CaseFiles(...)}` dict loaded the holdout volume. **Fix:** add `isinstance(paths, CasePaths)`, as `build_cache` already does. **Owner:** author.
- **N2. The allowlist trusts whichever split dict it is handed.** An edited dict with a holdout id moved into train was admitted without `allow_holdout`. The anchors already exist: split sha256 `c5c65a09…`, and `split.source_dataset_manifest.sha256 = f64d461f…`, which equals the `dataset_manifest.json` blob. **Fix:** verify both by default in `load_split_manifest`/`load_dataset_manifest` (tests opt out), record `split_sha256` in `CaseAllowlist` and the cache sidecars, and compare it in `SliceDataset`. **Owner:** author / Khánh.
- **N3. The id-to-path mapping is trusted.** Escapes from the package root are refused, but an in-root `..` is accepted. On real data, CASE_0059 was pointed at CASE_0079's file and accepted. On synthetic data, a TRAIN id served the holdout volume through `Training Set/../Testing Set/…`, and also through a plain alias without `..`. **Fix:** in `case_paths`, refuse `..` segments and refuse an allowlisted id whose resolved file is claimed by another case id. Optionally check `size_bytes` before opening. The N2 hash chain closes most of this. **Owner:** author.
- **N4. Cache reuse depends on a hand-bumped `PREPROCESSING_VERSION`.** A change to DR-011 or the resize code without a bump would silently reuse stale arrays. `_sidecar_current` also checks neither the sidecar's `case_id`/`partition` nor the `.npy` hashes. **Fix:** add a hash of the preprocessing source (or the ml commit plus a dirty flag) to the sidecar and the reuse test, and run C1 with `verify_hashes=True`. **Owner:** Khánh.
- **N5. Unmarked, behaviour-neutral deltas in the copied code.** `_fetch_checkpoint_cached` raises `RuntimeError` where probe exited with `SystemExit`. Weights hashing moved into `_sha256_file`. `dr011_normalize` was split into `_dr011` (which also returns lo/hi), and its mark says only "CHANGED: p_low/p_high default". **Fix:** add "CHANGED vs probe.py" notes. **Owner:** author.
- **N6. Tests and docs.**
  - `test_real_split_manifest_when_present` should assert the manifest sha256, that CASE_0117 and CASE_0133 are refused, and that `for_training("25_percent")` equals the effective ids. I verified all three manually.
  - `_have()` catches every exception, so a broken `fetch_checkpoint` would turn the DINOv2 tests into skips. Add an env flag that makes those skips fail on the training PC.
  - The README sentence saying the real-split test "is skipped until…" is stale after the merge.
  - There is no pinned `ml/requirements.txt`.
  - **Owner:** author.

## VERDICT

**REJECT at `e54f2616` (this also applies to `d5c04bc`, which has the identical patch).**

The core of the PR is sound on real data:
- fail-closed access holds against every accidental-misuse attempt;
- DR-011 is bit-identical to the C0 probe;
- the geometry round trip, cache hashing and Windows DataLoader workers all work;
- the networks match C0 down to the parameter count.

The two blocking findings are both mechanical (about 20 lines including one test). B1 would silently invalidate exactly the bf16 memory measurement C1 exists to make. B2 breaks the public-repo rule and the F5 redaction precedent.

**Re-review covers the delta only (about 10 minutes):**
1. Check the `autocast_for`/`PeakTracker` device normalisation and its new test.
2. Confirm that `git diff origin/main...HEAD` has no drive-letter path and that the defaults resolve from a linked worktree.
3. Re-run `python -m pytest ml/tests -q` on the head and on the merge with `origin/main`.

If Project Control overrides to start C1 at 13:30 before the fix, the minimum safe use is to pass `device` as the literal string `"cuda"` and to set `CARDIAC_PACKAGE_ROOT`/`CARDIAC_CACHE_ROOT`. That is an override, not a QA pass.

**Scratch** (outside git, about 232 MB including derived arrays for the 2 TRAIN cases plus the synthetic package): `<qa-scratch>\`. It holds scripts `s01`–`s08`, `s04_log.txt` (UTF-16), and `s04_results.json` and `s06_results.json`. Delete it when you're done; I left it for inspection.
