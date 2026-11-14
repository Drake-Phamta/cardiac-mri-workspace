/*
 * The one place the app loads expo-print, for SCR-08's "Export PDF". The require sits in a try: an APK built before
 * the module was added has no native side, its JS throws on load, and the button then says the export needs the
 * next app build instead of crashing (Metro treats a require inside try as optional). The render harness has no
 * expo-print either, so it takes the same path.
 */

let Print = null;
try {
  // eslint-disable-next-line global-require
  Print = require('expo-print');
} catch (_err) {
  Print = null;
}

const available = Boolean(Print && typeof Print.printAsync === 'function');

// Opens Android's print dialog on the HTML; "Save as PDF" there writes the file where the user chooses. The app
// itself keeps no copy.
async function print(html) {
  if (!available) return { ok: false, message: 'expo-print is not in this build' };
  try {
    await Print.printAsync({ html });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: (err && err.message) || String(err) };
  }
}

export const pdfPrinter = Object.freeze({ available, print });
