# QA delta: PR #77 `458219d..ffbf763` · **BLOCKED (CI red)**, one test-only fix away from MERGE AFTER GATE-MOB-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

*Reviewer: CHAT E, an LLM session (Claude) running under the team leader's account, not a second human reviewer. Read-only. One process at a time. Scratch and node_modules survived the reboot and were reused (package files unchanged). No npm ci, Gradle, expo export or device. Nothing deleted. Run at 19:55–20:05.*

| Check | Result | Evidence |
|---|---|---|
| Delta | `4f46b37` (docs) + `ffbf763` (shim) | Non-doc files: `mobile/index.js` (+3 lines: the shim import, placed first), `src/polyfills/textDecoderLatin1.mjs` (new), `test/textDecoderLatin1.test.mjs` (new). **Nothing else in the APK path changed.** Compared with the APK at `0bfaba3`, the app also gains `458219d` (R-3 timer fix, N-a wording), which I reviewed earlier. |
| Shim on Node | **PASS** | `new TextDecoder('latin1')` succeeds on Node, so the shim changes nothing (globalThis is untouched; installing again returns false). |
| Shim on a Hermes/Expo-like runtime | **PASS** | The device's decoder is Expo's UTF-8-only `expo/src/winter/TextDecoder.ts` (the "(normalized: …)" message comes from it). Expo installs it through a lazy getter/setter global. My probe copies that shape. The shim wraps it: the latin1 labels get ISO-8859-1 and every other label goes to Expo's decoder. `decode` handles a Uint8Array, an ArrayBuffer, a DataView, `undefined`, and 100 KB in chunks. |
| Prototype and labels | **OK** | `TextDecoder.prototype = Native.prototype`, so native-backed instances pass `instanceof`; a Latin1Decoder does not (fast-png never checks). Labels: `latin1`, `iso-8859-1`, `iso8859-1`, `l1`, trimmed and case-insensitive. fast-png 8.0.0 uses only `'latin1'` (`lib/helpers/text.js:5`). |
| TD2 detects the device crash | **Confirmed** | I disabled the install line in my scratch copy and TD2 failed, then I restored the file (hash-checked). |
| Unit and render | **PASS** | Unit 149/149 (TD1 and TD2 included); render 51/51 (logic only). |
| `gh pr checks 77` on `ffbf763` | **FAIL** | **`mobile shell logic tests (node --test)` fails.** CI runs without node_modules. TD2 calls `await import('fast-png')` → `ERR_MODULE_NOT_FOUND`: 142 pass, 1 fail, the rest are the existing skips. The other 9 checks pass; GitHub shows MERGEABLE / UNSTABLE. |
| Hygiene | **PASS** | 122 added lines: no IP, user path, serial or hash |

**BLOCKING (owner A2 / Phạm Tuấn Anh):**

**B-CI. TD2 has no skip guard for fast-png, so CI is red.** Every other fast-png test skips when node_modules is absent (`_png.mjs` `importMaskPngOrSkip`).
- **Fix:** guard the import inside TD2's `try`, so the `finally` still restores the TextDecoder:
  ```js
  let fp;
  try { fp = await import('fast-png'); }
  catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND') { t.skip('fast-png is not installed here …'); return; } throw e; }
  ```
- The shim assertions before it need no node_modules and keep running in CI.
- This is test-only, so the APK is unaffected.

**NON-BLOCKING:**
1. **The shim depends on load order.** It only works if a TextDecoder global already exists when it runs; otherwise `installLatin1TextDecoder` returns false and does nothing. Today Expo's winter runtime runs first via `getModulesRunBeforeMainModule`, which `@expo/metro-config` itself marks deprecated and "not enforced", and the device run proves it holds for this build.
   - Fix: also import the shim at the top of `src/imaging/maskPng.js`, just before `fast-png`. That works in either load order.
2. **latin1 here differs from Node.** The shim's latin1 is true ISO-8859-1 (0x80 → U+0080); Node and WHATWG map latin1 to windows-1252 (0x80 → U+20AC). This only affects PNG text chunks, never mask pixels, and ISO-8859-1 is what the PNG spec uses for tEXt. Add a comment so nobody "fixes" it later.
3. **The docs now name the wrong APK.** `S1_L4_SCRIPT.md` line 100 and §2b line 170 still say tonight's APK is `0bfaba3` (14:19:39). The session actually ran `cardiac-mri-workspace-live-20261001-194641.apk` built from `ffbf763`, which already contains the R-3 fix. The L4 PASS evidence and the script must name the APK actually used: file, `git_sha`, `apk_sha256`.

**VERDICT:**
- **Blocked:** only by red CI (B-CI, test-only fix). Once `mobile shell logic tests` is green: **MERGE AFTER GATE-MOB-01**.
- **The shim itself is sound.** It is a no-op on Node, works on the Expo-shaped runtime, and the device run confirms it.
- **The device L4 PASS on the `ffbf763` APK is unaffected** by this finding. Record it against `ffbf763`, not `0bfaba3`.

Scratch: `…\scratchpad\qa77\repo5` (node_modules moved there) and `qa_probe_td.mjs`.
