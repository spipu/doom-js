/**
 * Doom picture decoding (transposition of patch_to_rgba / flat_to_image of
 * convert_wad.py), producing ImageData usable directly by the engine textures.
 */
class WadPicture {
    /**
     * Decode a Doom picture (patch) into a transparent RGBA ImageData.
     * Column format: top_delta, count, unused pad, pixels…, unused pad.
     * top_delta == PATCH_END_COLUMN marks the end of the column.
     *
     * @param {DataView}   dv
     * @param {WadPalette} palette
     * @returns {ImageData}
     */
    static patchToImageData(dv, palette) {
        const w = dv.getUint16(0, true);
        const h = dv.getUint16(2, true);
        const image = new ImageData(w, h);
        const pixels = image.data;

        for (let x = 0; x < w; x++) {
            let off = dv.getUint32(8 + x * 4, true);
            while (true) {
                const topDelta = dv.getUint8(off);
                off += 1;
                if (topDelta === WadConstants.PATCH_END_COLUMN) {
                    break;
                }
                const count = dv.getUint8(off);
                off += 2;
                for (let j = 0; j < count; j++) {
                    const y = topDelta + j;
                    if (y >= 0 && y < h) {
                        const color = palette.getColor(dv.getUint8(off));
                        const p = (y * w + x) * 4;
                        pixels[p]     = color[0];
                        pixels[p + 1] = color[1];
                        pixels[p + 2] = color[2];
                        pixels[p + 3] = 255;
                    }
                    off += 1;
                }
                off += 1;
            }
        }

        return image;
    }

    /**
     * Decode a Doom flat (64x64 raw palette indices) into an opaque ImageData.
     *
     * @param {DataView}   dv
     * @param {WadPalette} palette
     * @returns {ImageData}
     */
    static flatToImageData(dv, palette) {
        const image = new ImageData(64, 64);
        const pixels = image.data;

        for (let y = 0; y < 64; y++) {
            for (let x = 0; x < 64; x++) {
                const color = palette.getColor(dv.getUint8(y * 64 + x));
                const p = (y * 64 + x) * 4;
                pixels[p]     = color[0];
                pixels[p + 1] = color[1];
                pixels[p + 2] = color[2];
                pixels[p + 3] = 255;
            }
        }

        return image;
    }

    /**
     * Paste a patch into a destination ImageData (equivalent of PIL paste with
     * alpha mask): only the opaque pixels of the patch are copied, with clipping.
     *
     * @param {ImageData} dest
     * @param {ImageData} src
     * @param {int}       ox
     * @param {int}       oy
     */
    static pastePatch(dest, src, ox, oy) {
        for (let y = 0; y < src.height; y++) {
            const dy = oy + y;
            if (dy < 0 || dy >= dest.height) {
                continue;
            }
            for (let x = 0; x < src.width; x++) {
                const dx = ox + x;
                if (dx < 0 || dx >= dest.width) {
                    continue;
                }
                const s = (y * src.width + x) * 4;
                if (src.data[s + 3] === 0) {
                    continue;
                }
                const d = (dy * dest.width + dx) * 4;
                dest.data[d]     = src.data[s];
                dest.data[d + 1] = src.data[s + 1];
                dest.data[d + 2] = src.data[s + 2];
                dest.data[d + 3] = src.data[s + 3];
            }
        }
    }
}
