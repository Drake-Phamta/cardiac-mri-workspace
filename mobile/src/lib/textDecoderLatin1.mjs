/*
 * Hermes' TextDecoder knows only UTF-8, but fast-png creates a latin1 decoder when it loads, so the release
 * app would crash before the first screen (Node knows latin1, so tests do not show it). This adds a latin1
 * decoder and leaves every other label to the runtime. It must be the first import of index.js.
 */

// True ISO-8859-1 (byte 0x80 -> U+0080), as PNG text chunks use. Node maps "latin1" to windows-1252
// instead; that only affects PNG text chunks, never mask pixels.
const LATIN1_LABELS = new Set(['latin1', 'iso-8859-1', 'iso8859-1', 'l1']);

class Latin1Decoder {
  constructor() {
    this.encoding = 'latin1';
    this.fatal = false;
    this.ignoreBOM = false;
  }

  decode(input) {
    if (input === undefined || input === null) return '';
    const bytes = input instanceof Uint8Array
      ? input
      : ArrayBuffer.isView(input)
        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : new Uint8Array(input);
    let out = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return out;
  }
}

export function installLatin1TextDecoder(scope) {
  const Native = scope.TextDecoder;
  if (typeof Native !== 'function') return false;
  try {
    new Native('latin1'); // eslint-disable-line no-new
    return false;          // the runtime already handles it
  } catch {
    // Hermes: fall through and wrap.
  }
  function TextDecoder(label = 'utf-8', options) {
    if (LATIN1_LABELS.has(String(label).trim().toLowerCase())) return new Latin1Decoder();
    return new Native(label, options);
  }
  TextDecoder.prototype = Native.prototype;
  scope.TextDecoder = TextDecoder;
  return true;
}

installLatin1TextDecoder(globalThis);
