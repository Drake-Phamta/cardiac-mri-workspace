// Stand-in for react-native-webview (SCR-05). No page is loaded and no GL runs: it renders a host 'WebView' node
// carrying the props the screen gave it (so a check can call onMessage like the page would), and records every message
// the screen posts to the viewer in `sent`. The viewer script itself is tested in test/v2_viewer.test.mjs.
import React, { forwardRef, useImperativeHandle } from 'react';

export const sent = [];

export const WebView = forwardRef(function WebView(props, ref) {
  useImperativeHandle(ref, () => ({ postMessage: (message) => { sent.push(message); }, reload() {} }), []);
  return React.createElement('WebView', props);
});

export default WebView;
