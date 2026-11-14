// node --test mobile/test/  - privacy checks on a note or a flag reason (src/screens/v4-review/notes.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import { checkNote, noteMessage, NOTE_MAX, WARNING } from '../src/screens/v4-review/notes.mjs';

const warnings = (text) => [...checkNote(text).warnings];

test('NT1 an image-only note passes with no warning, slice numbers and pixel counts included', () => {
  for (const text of [
    'Leaks into the right ventricle on slices 40-48.',
    'Boundary misses the septal wall at (310, 262); about 120 px under-segmented.',
    'Disconnected island near the apex, slices 12, 13 and 14.',
    'Ảnh mờ ở đáy tim, lát 44.',
    '',
  ]) {
    assert.deepEqual(warnings(text), [], text);
    assert.equal(checkNote(text).ok, true);
  }
});

test('NT2 dates are warned about, once, in the common written forms', () => {
  for (const text of ['Seen 12/03/2024', 'scan 2024-03-12', 'born 1.2.85', 'on 12 March 2024', 'Mar 3rd follow-up',
    'chụp ngày 12', 'tháng 3']) {
    assert.deepEqual(warnings(text), [WARNING.DATE], text);
  }
  assert.deepEqual(warnings('12 decimal places'), [], 'a word that starts like a month is not a date');
});

test('NT3 ID-like digit runs and grouped phone numbers are warned about', () => {
  for (const text of ['record 0791234567', 'CCCD 079123456789', 'call 0912 345 678', 'tel +84 912.345.678']) {
    assert.deepEqual(warnings(text), [WARNING.ID_OR_PHONE], text);
  }
  assert.deepEqual(warnings('slices 44 45 46'), [], 'a few slice numbers are not a phone number');
});

test('NT4 emails and a title before a capitalised name are warned about', () => {
  assert.deepEqual(warnings('ask someone@hospital.example'), [WARNING.EMAIL]);
  for (const text of ['Dr Smith agreed', 'per Mrs. Brown', 'bà Lan', 'BN Nguyễn Văn A', 'bệnh nhân Hùng']) {
    assert.deepEqual(warnings(text), [WARNING.NAME_TITLE], text);
  }
  assert.deepEqual(warnings('the dr flag is off; anh ấy said ok'), [], 'a title before a lower-case word is not a name');
});

test('NT5 several kinds are listed together; the length limit is the only thing that blocks', () => {
  const both = checkNote('Dr Smith, 12/03/2024, someone@x.org, 0912 345 678');
  assert.deepEqual([...both.warnings], [WARNING.DATE, WARNING.ID_OR_PHONE, WARNING.EMAIL, WARNING.NAME_TITLE]);
  assert.equal(both.ok, true, 'warnings never block on their own');
  assert.match(noteMessage(both), /^This text looks like a date, .* Describe the image only/);
  const long = checkNote('x'.repeat(NOTE_MAX + 1));
  assert.equal(long.tooLong, true);
  assert.equal(long.ok, false);
  assert.equal(noteMessage(long), `Too long: ${NOTE_MAX + 1} of at most ${NOTE_MAX} characters.`);
  assert.equal(checkNote('x'.repeat(NOTE_MAX)).ok, true, 'exactly the limit is fine');
  assert.equal(checkNote('abc', { max: 2 }).ok, false, 'the limit can be set per use');
  assert.equal(noteMessage(checkNote('fine')), null);
});

test('NT6 empty and whitespace-only text is reported as empty; a non-string is treated as empty', () => {
  assert.equal(checkNote('   \n ').empty, true);
  assert.equal(checkNote(undefined).empty, true);
  assert.equal(checkNote(undefined).length, 0);
  assert.equal(checkNote('a').empty, false);
});
