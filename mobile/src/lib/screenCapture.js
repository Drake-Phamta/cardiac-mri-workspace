/*
 * The one place the app loads expo-screen-capture. The require sits in a try: an APK built before the module was
 * added has no native side, its JS throws on load, and privacy mode then reads "not available" instead of crashing
 * (Metro treats a require inside try as optional). usePrivacyMode(key) applies the session's wish for one screen
 * and lifts it when the screen closes, so screens without MRI stay capturable.
 */

import { useCallback, useEffect, useState } from 'react';

import { applyPrivacy, PRIVACY, privacyWanted, setPrivacyWanted } from './privacy.mjs';

let screenCapture = null;
try {
  // eslint-disable-next-line global-require
  screenCapture = require('expo-screen-capture');
} catch (_err) {
  screenCapture = null;
}

export function usePrivacyMode(key) {
  const [on, setOn] = useState(privacyWanted);
  const [status, setStatus] = useState(PRIVACY.PENDING);
  useEffect(() => {
    let alive = true;
    setStatus(PRIVACY.PENDING);
    applyPrivacy(screenCapture, on, key).then((st) => { if (alive) setStatus(st); });
    return () => {
      alive = false;
      if (on) applyPrivacy(screenCapture, false, key);
    };
  }, [on, key]);
  const toggle = useCallback(() => {
    setOn((v) => {
      setPrivacyWanted(!v);
      return !v;
    });
  }, []);
  return { on, status, toggle };
}
