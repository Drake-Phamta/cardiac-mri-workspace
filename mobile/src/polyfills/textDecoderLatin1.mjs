/*
 * Hermes' built-in TextDecoder decodes UTF-8 only: `new TextDecoder('latin1')`
 * throws `RangeError: Unknown encoding: latin1`. fast-png builds exactly that
 * decoder at module load (lib/helpers/text.js, for tEXt chunks), so a release
 * APK that imports the mask decoder died before the first screen on the A17
 * (S-1 device session, 2026-10-01). Node's TextDecoder knows latin1, which is
 * why no test on the laptop saw it.
 *
 * This module must be the FIRST import of index.js. It changes nothing where
 * the runtime already decodes latin1; elsewhere it answers the latin1 labels
 * with a small ISO-8859-1 decoder (byte n -> U+00nn) and passes every other
 * label to the runtime's own TextDecoder.
 */

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
