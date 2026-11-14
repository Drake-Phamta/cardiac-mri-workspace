// Shared by the V2 viewer tests: the SCR-05 page script (viewerHtml.mjs) run in node against a stubbed canvas, 2D axis
// canvas and WebGL2 context, with the page's own handlers captured so a test can send messages and touch events.
import vm from 'node:vm';

import { VIEWER_SCRIPT } from '../src/screens/v2-3d/viewerHtml.mjs';

export function makeViewer() {
  const posted = [];
  const canvasHandlers = {};
  const windowHandlers = {};
  const documentHandlers = {};
  const glCalls = [];
  let created = 0;
  const gl = new Proxy({}, {
    get: (_t, name) => {
      if (typeof name !== 'string') return undefined;
      if (/^[A-Z_0-9]+$/.test(name)) return name; // GL constants
      if (name === 'getExtension') return (ext) => (ext === 'WEBGL_lose_context' ? { loseContext: () => glCalls.push(['loseContext']) } : null);
      return (...args) => {
        glCalls.push([name, ...args]);
        if (name.startsWith('create')) { created += 1; return { name, id: created }; }
        return name === 'getUniformLocation' ? { name: args[1] } : true;
      };
    },
  });
  // The axis marker draws on its own 2D canvas; this one records what is written on it.
  const axesText = [];
  const axes2d = new Proxy({}, {
    get: (_t, name) => (name === 'fillText' ? (text) => axesText.push(text) : () => true),
    set: () => true,
  });
  const axesCanvas = { width: 0, height: 0, getContext: (kind) => (kind === '2d' ? axes2d : null) };
  const rect = { left: 0, top: 0, width: 400, height: 400 };
  const canvas = {
    clientWidth: 400, clientHeight: 400, width: 0, height: 0, getContext: () => gl, setPointerCapture() {},
    getBoundingClientRect: () => rect, addEventListener: (type, fn) => { canvasHandlers[type] = fn; },
  };
  // The tools are drawn into this element as HTML; one delegated click listener serves every button.
  const toolsHandlers = {};
  const tools = { innerHTML: '', addEventListener: (type, fn) => { toolsHandlers[type] = fn; } };
  // #free is the box between the app bar and the bottom panel; the page moves its edges (style.top / bottom).
  const free = { style: {} };
  const elements = { axes: axesCanvas, tools, free };
  const document = { getElementById: (id) => elements[id] || canvas, addEventListener: (type, fn) => { documentHandlers[type] = fn; } };
  const frames = [];
  const window = {
    ReactNativeWebView: { postMessage: (m) => posted.push(JSON.parse(m)) },
    addEventListener: (type, fn) => { windowHandlers[type] = fn; },
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; }, devicePixelRatio: 1,
  };
  const context = vm.createContext({ window, document, atob: globalThis.atob, console });
  new vm.Script(VIEWER_SCRIPT, { filename: 'viewer-script.js' }).runInContext(context);
  const api = window.__cardiacViewer;
  const send = (message) => windowHandlers.message({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  const b64 = (bytes) => Buffer.from(bytes).toString('base64');
  const load = (role, bytes) => send({ type: 'mesh', role, b64: b64(bytes) });
  const events = (type) => posted.filter((m) => m.type === type);
  // Runs the page's next animation frame (draw), as the browser would.
  const frame = () => { const fn = frames.shift(); if (fn) fn(); };
  const tap = (x, y) => {
    canvasHandlers.pointerdown({ pointerId: 9, clientX: x, clientY: y });
    canvasHandlers.pointerup({ type: 'pointerup', pointerId: 9, clientX: x, clientY: y });
  };
  // Presses a tool the way the page's listener sees it: the button's data-act and data-arg.
  const press = (act, arg = '') => toolsHandlers.click({ target: { closest: () => ({ dataset: { act, arg: String(arg) } }) } });
  // The attributes of the tool button with this aria-label, or null when the tools do not draw it.
  const button = (label) => {
    const m = new RegExp('<button ([^>]*aria-label="' + label.replace(/[()+]/g, '\\$&') + '"[^>]*)>').exec(tools.innerHTML);
    return m ? m[1] : null;
  };
  return { api, posted, canvas, canvasHandlers, windowHandlers, documentHandlers, glCalls, send, load, events, rect, frame, tap, axesText, tools, free, press, button };
}
