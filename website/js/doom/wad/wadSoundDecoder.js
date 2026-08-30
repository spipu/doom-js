/**
 * Binary readers of the WAD audio lumps: a DMX sound-effect lump into raw PCM
 * ready for the engine, and the magic of a music lump (MUS or standard MIDI).
 *
 * DMX layout (verified on the six IWADs — see the sound documentation):
 * an 8-byte header — format uint16 (always 3 = PCM), rate uint16, sample count
 * uint32 — then that many bytes of UNSIGNED 8-bit PCM (centre = 128). Vanilla
 * DMX pads the samples with 16 leading and 16 trailing guard bytes of constant
 * value; Freedoom lumps carry no such padding, so it is detected, never assumed.
 *
 * Sounds are always resolved BY NAME from the profile table, never by sniffing
 * headers: a map lump can pass the format-3 test while announcing a 0 Hz rate.
 */
class WadSoundDecoder {
    /**
     * @param {DataView|null} dv content of a sound lump
     * @returns {{rate: number, samples: Float32Array}|null} null on any malformed lump
     */
    static decode(dv) {
        if ((dv === null) || (dv.byteLength < 8)) {
            return null;
        }

        const format = dv.getUint16(0, true);
        const rate   = dv.getUint16(2, true);
        const count  = dv.getUint32(4, true);
        if ((format !== WadSoundDecoder.DMX_FORMAT_PCM) || (rate === 0) || (count === 0)) {
            return null;
        }
        if ((8 + count) > dv.byteLength) {
            return null;
        }

        let start = 8;
        let end   = 8 + count;
        const pad = WadSoundDecoder.DMX_PAD_SAMPLES;
        if (count > (2 * pad)) {
            if (WadSoundDecoder._isConstantRun(dv, start, pad)) {
                start += pad;
            }
            if (WadSoundDecoder._isConstantRun(dv, end - pad, pad)) {
                end -= pad;
            }
        }

        // Unsigned 8-bit, centre 128: subtract the offset before scaling, or
        // the whole signal is shifted (saturation + a click on every start).
        const samples = new Float32Array(end - start);
        for (let i = start; i < end; i++) {
            samples[i - start] = (dv.getUint8(i) - 128) / 128;
        }

        return {rate: rate, samples: samples};
    }

    /**
     * @param {DataView|null} dv content of a music lump
     * @returns {string|null} 'mus', 'midi', or null when neither magic matches
     */
    static musicFormat(dv) {
        if ((dv === null) || (dv.byteLength < 4)) {
            return null;
        }

        const b0 = dv.getUint8(0);
        const b1 = dv.getUint8(1);
        const b2 = dv.getUint8(2);
        const b3 = dv.getUint8(3);
        if ((b0 === 0x4D) && (b1 === 0x55) && (b2 === 0x53) && (b3 === 0x1A)) {
            return 'mus';
        }
        if ((b0 === 0x4D) && (b1 === 0x54) && (b2 === 0x68) && (b3 === 0x64)) {
            return 'midi';
        }

        return null;
    }

    static _isConstantRun(dv, offset, length) {
        const first = dv.getUint8(offset);
        for (let i = 1; i < length; i++) {
            if (dv.getUint8(offset + i) !== first) {
                return false;
            }
        }
        return true;
    }
}

WadSoundDecoder.DMX_FORMAT_PCM  = 3;
WadSoundDecoder.DMX_PAD_SAMPLES = 16;
