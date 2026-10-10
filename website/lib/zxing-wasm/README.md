# zxing-wasm (vendored)

QR code reading and writing in the browser — the WebAssembly build of
[zxing-cpp](https://github.com/zxing-cpp/zxing-cpp) with its JavaScript wrapper,
published as [zxing-wasm](https://www.npmjs.com/package/zxing-wasm).

- Version: **3.1.4**, `full` build (reader and writer).
- Licences: MIT, Apache-2.0 and BSD-3-Clause, see [LICENSE.md](LICENSE.md).

## Files

| File | Origin (npm package path) |
|---|---|
| `zxing-wasm.full.iife.js` | `dist/iife/full/index.js` — unmodified, renamed |
| `zxing_full.wasm` | `dist/full/zxing_full.wasm` — unmodified |

The IIFE build exposes a `ZXingWASM` global, so it loads in global scope through the
bootstrap like every other script. Its only network access is the fetch of its `.wasm`,
aimed at the jsDelivr CDN by default: callers must redirect it to the local copy with
`ZXingWASM.prepareZXingModule({overrides: {locateFile}})` before any read or write, so
that no CDN is ever contacted and the library works offline.

## Updating

Download the new package (`npm pack zxing-wasm@<version>`), copy the two files above
under the same names, and update the version here.
