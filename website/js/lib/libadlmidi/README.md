# libADLMIDI-JS (vendored)

OPL3 FM synthesis in the browser — the WebAssembly build of
[libADLMIDI](https://github.com/Wohlstand/libADLMIDI) with its AudioWorklet
JavaScript wrapper, published as [libadlmidi-js](https://www.npmjs.com/package/libadlmidi-js).

- Version: **2.2.0**, `dosbox.slim` build (DOSBox OPL3 core, no embedded banks —
  the GENMIDI bank of the loaded WAD is converted to WOPL and fed at runtime).
- License: **LGPL-3.0** (see [LICENSE.md](LICENSE.md)). This directory is the
  LGPL boundary of the project, like `assets/uzdoom/` is its GPL one; the rest
  of the code base stays MIT.

## Files

| File | Origin (npm package path) |
|---|---|
| `libadlmidi.js` | `dist/libadlmidi.js` — **modified**, see below |
| `libadlmidi.dosbox.slim.processor.js` | `dist/libadlmidi.dosbox.slim.processor.js` — unmodified |
| `libadlmidi.dosbox.slim.core.wasm` | `dist/libadlmidi.dosbox.slim.core.wasm` — unmodified |

## Modification (LGPL section 4 notice)

`libadlmidi.js` is distributed by the package as a pure ES module, which this
application cannot load (every script is loaded in global scope by its
bootstrap). The final `export` block of the file:

```javascript
var libadlmidi_default = AdlMidi;
export {
  AdlMidi,
  Emulator,
  TrackOption,
  libadlmidi_default as default
};
//# sourceMappingURL=libadlmidi.js.map
```

was replaced by global assignments:

```javascript
window.AdlMidi            = AdlMidi;
window.AdlMidiEmulator    = Emulator;
window.AdlMidiTrackOption = TrackOption;
```

Nothing else was changed. Re-apply the same replacement when upgrading the
package, so a diff against the original `dist/libadlmidi.js` stays trivial.
