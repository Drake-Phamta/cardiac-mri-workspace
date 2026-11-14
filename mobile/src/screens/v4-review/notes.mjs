// Privacy checks on free text before it is saved: a finding's note and a flag's reason (spec 12 section 2: no
// patient name, date of birth, ID number, record number or contact details). Text over the length limit cannot
// be saved. Anything that looks like personal data is a warning: the user sees it and must choose to save anyway,
// because a slice number or a pixel count can look like a number too. Plain JS that Node tests import.

export const NOTE_MAX = 500;

export const WARNING = Object.freeze({
  DATE: 'looks like a date',
  ID_OR_PHONE: 'looks like an ID or phone number',
  EMAIL: 'looks like an email address',
  NAME_TITLE: 'looks like a person\'s name (a title before a name)',
});

const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?'
  + '|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const DATES = [
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,                // 12/03/2024, 1-2-24
  /\b\d{4}[/.-]\d{1,2}[/.-]\d{1,2}\b/g,                  // 2024-03-12
  new RegExp(`\\b\\d{1,2}\\s+${MONTH}(?:\\s+\\d{2,4})?\\b`, 'gi'), // 12 March 2024
  new RegExp(`\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, 'gi'),  // March 12th
  /(?:ngày|tháng)\s*\d{1,2}/giu,                         // ngày 12, tháng 3
];
// Six or more digits in a row (an ID or record number), or digits grouped like a phone number (0912 345 678).
const LONG_NUMBER = /\d{6,}/;
const PHONE = /\+?\d{2,4}[ .-]\d{3,4}[ .-]\d{3,4}/;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
// A title followed by a word; it is a warning only when that word starts with a capital (Dr Smith, bà Lan).
const TITLE = /(^|[^\p{L}])(mr|mrs|ms|miss|dr|prof|ông|bà|anh|chị|bác|bn|bệnh nhân)\.?\s+(\p{L}+)/giu;

function hasNameTitle(text) {
  for (const m of text.matchAll(TITLE)) {
    const word = m[3];
    if (word[0] !== word[0].toLowerCase()) return true;
  }
  return false;
}

// What is wrong with `text`, or what may be: { length, max, empty, tooLong, ok, warnings: [label, ...] }.
// ok means it may be saved (within the limit); the caller decides whether empty text is allowed.
export function checkNote(text, { max = NOTE_MAX } = {}) {
  const value = typeof text === 'string' ? text : '';
  const warnings = [];
  let rest = value;
  if (DATES.some((re) => value.match(re))) {
    warnings.push(WARNING.DATE);
    // A date is reported once, as a date, not again as a long number.
    for (const re of DATES) rest = rest.replace(re, ' ');
  }
  if (LONG_NUMBER.test(rest) || PHONE.test(rest)) warnings.push(WARNING.ID_OR_PHONE);
  if (EMAIL.test(value)) warnings.push(WARNING.EMAIL);
  if (hasNameTitle(value)) warnings.push(WARNING.NAME_TITLE);
  const tooLong = value.length > max;
  return Object.freeze({
    length: value.length,
    max,
    empty: value.trim() === '',
    tooLong,
    ok: !tooLong,
    warnings: Object.freeze(warnings),
  });
}

// One line for the screen under the text box, or null when there is nothing to say.
export function noteMessage(check) {
  if (check.tooLong) return `Too long: ${check.length} of at most ${check.max} characters.`;
  if (check.warnings.length) {
    return `This text ${check.warnings.join(', ')}. Describe the image only: no names, dates of birth, `
      + 'ID or phone numbers, or emails.';
  }
  return null;
}
