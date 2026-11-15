// node --test mobile/test/  - V4 Privacy mode: SCR-06 shows the MRI and the masks, so it has the privacy mode of SCR-03 and
// SCR-04 (the shared hook, on by default, the shield in the bar, one memory for the session). SCR-08 shows no image, so
// it has none. The hook runs in the render smoke (V4pm); the mode itself is tested in privacy.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { applyPrivacy, PRIVACY, privacyText, privacyWanted, setPrivacyWanted } from '../src/lib/privacy.mjs';
import { findingsReportHtml } from '../src/screens/v4-review/findings.mjs';
import { MOBILE_ROOT } from './_helpers.mjs';

const REVIEW = join(MOBILE_ROOT, 'src', 'screens', 'v4-review');
// A source file without its comments, so a check sees code and not what a comment says.
const code = (...parts) => readFileSync(join(...parts), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function fakeModule() {
  const calls = [];
  return {
    calls,
    isAvailableAsync: async () => true,
    preventScreenCaptureAsync: async (key) => { calls.push(['prevent', key]); },
    allowScreenCaptureAsync: async (key) => { calls.push(['allow', key]); },
  };
}

test('VP1 SCR-06 reads the MRI and the masks, and asks for privacy mode under its own key with the shared hook', () => {
  const src = code(REVIEW, 'ReviewCorrectionScreen.js');
  assert.match(src, /'mri_slice_get'/, 'it draws the MRI, which is why it needs the mode');
  assert.equal(src.match(/usePrivacyMode\(/g).length, 1, 'one call, not one per phase of the screen');
  assert.match(src, /usePrivacyMode\('SCR-06'\)/);
  assert.match(src, /from '\.\.\/\.\.\/lib\/screenCapture'/, 'the one loader of expo-screen-capture');
  assert.match(src, /from '\.\.\/\.\.\/lib\/privacy\.mjs'/, 'the words and the status of the mode are the shared ones');
  assert.doesNotMatch(src, /expo-screen-capture|setPrivacyWanted|preventScreenCaptureAsync/, 'no copy of the hook or of the module');
});

test('VP2 the shield sits in SCR-06\'s bar as in SCR-03 and SCR-04: lit only while protected, one press switches, and Details say it', () => {
  const src = code(REVIEW, 'ReviewCorrectionScreen.js');
  assert.match(src, /const priv = privacyText\(privacy\.status, privacy\.on\);/);
  assert.match(src, /key: 'privacy', icon: IconShield, label: priv\.title, active: privacy\.status === PRIVACY\.PROTECTED, onPress: privacy\.toggle,/);
  assert.match(src, /nav\.setContext\(\{[^}]*\bactions\b[^}]*\}\)/, 'the shield is reported to the shell with the rest of the bar');
  assert.match(src, /\{ title: 'Privacy', lines: \[priv\.title, priv\.detail\]\.filter\(Boolean\) \}/, 'the Details sheet has a Privacy section');
  // What the shield says in each state comes from the shared words: only PROTECTED says ON.
  for (const status of [PRIVACY.PENDING, PRIVACY.OFF, PRIVACY.UNAVAILABLE, PRIVACY.FAILED]) {
    assert.doesNotMatch(privacyText(status, true).title, /^Privacy mode: ON$/, status);
  }
  assert.equal(privacyText(PRIVACY.PROTECTED, true).title, 'Privacy mode: ON');
});

test('VP3 SCR-06 blocks capture under the key SCR-06 and lets go of that key alone; the wish for the session is shared', async () => {
  const mod = fakeModule();
  assert.equal(await applyPrivacy(mod, true, 'SCR-06'), PRIVACY.PROTECTED);
  assert.equal(await applyPrivacy(mod, false, 'SCR-06'), PRIVACY.OFF);
  assert.deepEqual(mod.calls, [['prevent', 'SCR-06'], ['allow', 'SCR-06']], 'a key for each screen: leaving SCR-06 never lifts SCR-03\'s block');
  // On by default; a switch made on one screen is what the next screen opens with (the hook starts from this one wish).
  assert.equal(privacyWanted(), true);
  setPrivacyWanted(false);
  assert.equal(privacyWanted(), false);
  setPrivacyWanted(true);
  assert.equal(privacyWanted(), true);
  const hook = code(MOBILE_ROOT, 'src', 'lib', 'screenCapture.js');
  assert.match(hook, /useState\(privacyWanted\)/);
  assert.match(hook, /setPrivacyWanted\(!v\)/);
});

test('VP4 SCR-08 shows no image, so it has no privacy mode: no picture, no image endpoint, a PDF with no image', () => {
  for (const f of ['FindingsScreen.js', 'findings.mjs', 'pdfExport.js', 'Notice.js', 'NoteCheck.js']) {
    const src = code(REVIEW, f);
    assert.doesNotMatch(src, /\bImage\b|react-native-svg|<Svg|usePrivacyMode|screenCapture/, `${f} draws no picture`);
    assert.doesNotMatch(src, /mri_slice_get|prediction_slice_get|reviewed_mask_slice_get|content\.bytes|data:image/, `${f} asks for no image`);
  }
  const endpoints = new Set([...code(REVIEW, 'findings.mjs').matchAll(/'([a-z_]+_(?:list|get|create|patch))'/g)].map((m) => m[1]));
  assert.deepEqual([...endpoints].sort(), ['finding_create', 'finding_patch', 'findings_list'], 'SCR-08 reads and writes findings only');
  const html = findingsReportHtml({
    entries: [{ finding: { findingId: 'FINDING_1', type: 'UNDER_SEGMENTATION', status: 'OPEN', caseId: 'CASE_0029', sliceIndex: 44, note: 'edge <b>missed</b>' } }],
    studyId: 'STUDY_DEMO', filter: {}, generatedAt: '2026-11-15 09:00 UTC',
  });
  assert.doesNotMatch(html, /<img|<svg|data:image|<canvas/i, 'the exported report holds no image');
  assert.match(html, /holds no image/, 'and it says so');
});
