/*
 * Privacy mode for the screens that show MRI (SCR-03, SCR-04). While it is on, Android's secure-window flag (set by
 * expo-screen-capture) turns screenshots, screen recordings, casting and the recent-apps thumbnail black. It is on
 * by default and is turned off only for a projector or screen sharing. The native module arrives with the next
 * APK; until then the mode says it is unavailable and nothing breaks. Plain JS: the module is passed in, so node
 * tests use a fake. screenCapture.js loads the real one.
 */

export const PRIVACY = Object.freeze({
  PENDING: 'PENDING', PROTECTED: 'PROTECTED', OFF: 'OFF', UNAVAILABLE: 'UNAVAILABLE', FAILED: 'FAILED',
});

// What the user wants, kept for the session (a screen unmounts under the next one). On until switched off.
let wanted = true;
export const privacyWanted = () => wanted;
export function setPrivacyWanted(on) { wanted = on === true; }

const usable = (mod) => (mod && typeof mod.preventScreenCaptureAsync === 'function'
  && typeof mod.allowScreenCaptureAsync === 'function' ? mod : null);

// Asks the module to block (on) or allow (off) capture for one screen's key, and answers what is in force.
export async function applyPrivacy(mod, on, key) {
  const api = usable(mod);
  if (!api) return PRIVACY.UNAVAILABLE;
  try {
    if (typeof api.isAvailableAsync === 'function' && !(await api.isAvailableAsync())) return PRIVACY.UNAVAILABLE;
    if (on) {
      await api.preventScreenCaptureAsync(key);
      return PRIVACY.PROTECTED;
    }
    await api.allowScreenCaptureAsync(key);
    return PRIVACY.OFF;
  } catch (_err) {
    return PRIVACY.FAILED;
  }
}

// The words on the switch. Only PROTECTED says the screen is protected.
export function privacyText(status, on) {
  switch (status) {
    case PRIVACY.PROTECTED:
      return Object.freeze({
        title: 'Privacy mode: ON',
        detail: 'Screenshots, screen recording and casting show black here, and the recent-apps preview is hidden. Turn it off only for a projector or screen sharing.',
        tone: 'ok',
      });
    case PRIVACY.OFF:
      return Object.freeze({
        title: 'Privacy mode: OFF',
        detail: 'Screenshots and screen sharing show this screen. Turn it back on when the presentation is over.',
        tone: 'warn',
      });
    case PRIVACY.UNAVAILABLE:
      return Object.freeze({
        title: on ? 'Privacy mode: not available in this build' : 'Privacy mode: OFF (not available in this build)',
        detail: 'This app build has no screen-capture module yet (it comes with the next APK), so screenshots are not blocked.',
        tone: 'warn',
      });
    case PRIVACY.FAILED:
      return Object.freeze({
        title: 'Privacy mode: could not be applied',
        detail: 'The phone refused the request, so screenshots are not blocked.',
        tone: 'warn',
      });
    default:
      return Object.freeze({ title: `Privacy mode: ${on ? 'turning on' : 'turning off'}…`, detail: null, tone: 'neutral' });
  }
}
