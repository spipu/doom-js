/**
 * Converter of the WAD's GENMIDI lump (DMX OPL2 bank, 175 instruments) into a
 * WOPL v3 bank, the only format libADLMIDI accepts at runtime.
 *
 * Both layouts are transcribed from their reference implementations, never
 * from memory: DMX side from OPL3BankEditor format_dmxopl2.cpp (+ doomwiki
 * GENMIDI), WOPL side from its official specification and the same editor's
 * format_wohlstand_opl3.cpp writer. The net field mapping is a raw-register
 * passthrough — the editor's internal inversions cancel out — with a single
 * composition: the WOPL 0x40 register byte packs (KSL & 0xC0) | (level & 0x3F).
 *
 * The generated header declares the DMX volume model, so libADLMIDI scales
 * velocities exactly like the game's own driver did.
 */
class WadGenmidi {
    /**
     * @param {DataView|null} dv content of the GENMIDI lump
     * @returns {Uint8Array|null} a WOPL v3 bank, null on any malformed lump
     */
    static toWopl(dv) {
        if ((dv === null) || (dv.byteLength < WadGenmidi.RECORDS_END)) {
            return null;
        }
        for (let i = 0; i < WadGenmidi.MAGIC.length; i++) {
            if (dv.getUint8(i) !== WadGenmidi.MAGIC.charCodeAt(i)) {
                return null;
            }
        }

        const out  = new Uint8Array(WadGenmidi.WOPL_TOTAL_SIZE);
        const view = new DataView(out.buffer);
        let offset = WadGenmidi._writeHeader(out, view);

        // Every slot of both 128-instrument banks starts blank; the 175 DMX
        // records then land on their own — melodic 0-127, then the GM
        // percussion notes 35-81 (reference reader: Ins_Percussion[i-128+35]).
        const melodicBase    = offset;
        const percussionBase = offset + (WadGenmidi.WOPL_INST_SIZE * 128);
        for (let slot = 0; slot < 256; slot++) {
            out[offset + (slot * WadGenmidi.WOPL_INST_SIZE) + 39] = WadGenmidi.WOPL_FLAG_BLANK;
        }
        const namesPresent = (dv.byteLength >= (WadGenmidi.RECORDS_END + (WadGenmidi.RECORD_COUNT * WadGenmidi.NAME_SIZE)));
        for (let i = 0; i < WadGenmidi.RECORD_COUNT; i++) {
            const record = 8 + (i * WadGenmidi.RECORD_SIZE);
            const target = ((i < 128)
                ? (melodicBase + (i * WadGenmidi.WOPL_INST_SIZE))
                : (percussionBase + ((WadGenmidi.PERCUSSION_FIRST_NOTE + i - 128) * WadGenmidi.WOPL_INST_SIZE)));
            const name = (namesPresent ? (WadGenmidi.RECORDS_END + (i * WadGenmidi.NAME_SIZE)) : -1);
            WadGenmidi._writeInstrument(out, view, target, dv, record, name);
        }

        return out;
    }

    // WOPL header + the two bank meta entries (version 2+ requires them).
    static _writeHeader(out, view) {
        let offset = 0;
        for (let i = 0; i < WadGenmidi.WOPL_MAGIC.length; i++) {
            out[i] = WadGenmidi.WOPL_MAGIC.charCodeAt(i);
        }
        out[10] = 0;
        view.setUint16(11, WadGenmidi.WOPL_VERSION, true);
        view.setUint16(13, 1, false);
        view.setUint16(15, 1, false);
        out[17] = 0;
        out[18] = WadGenmidi.WOPL_VOLUME_MODEL_DMX;
        offset  = 19;
        for (const name of ['GENMIDI melodic', 'GENMIDI percussion']) {
            for (let i = 0; i < name.length; i++) {
                out[offset + i] = name.charCodeAt(i);
            }
            offset += WadGenmidi.NAME_SIZE + 2;
        }

        return offset;
    }

    // One 36-byte DMX record into one 66-byte WOPL v3 instrument entry.
    static _writeInstrument(out, view, target, dv, record, name) {
        const flags       = dv.getUint16(record, true);
        const fixed       = ((flags & WadGenmidi.DMX_FLAG_FIXED_PITCH) !== 0);
        const doubleVoice = ((flags & WadGenmidi.DMX_FLAG_DOUBLE_VOICE) !== 0);
        const idata       = record + 4;

        if (name >= 0) {
            for (let i = 0; i < (WadGenmidi.NAME_SIZE - 1); i++) {
                out[target + i] = dv.getUint8(name + i);
            }
        }
        // Note offsets carry the reference reader's +12 bias; a fixed-pitch
        // instrument ignores its offsets entirely (DMX rule).
        view.setInt16(target + 32, (fixed ? 12 : (dv.getInt16(idata + 14, true) + 12)), false);
        view.setInt16(target + 34, (fixed ? 12 : (dv.getInt16(idata + 30, true) + 12)), false);
        out[target + 36] = 0;
        out[target + 37] = ((dv.getUint8(record + 2) - 128) & 0xFF);
        out[target + 38] = dv.getUint8(record + 3);
        out[target + 39] = ((doubleVoice ? (WadGenmidi.WOPL_FLAG_4OP | WadGenmidi.WOPL_FLAG_PSEUDO_4OP) : 0)
            | (fixed ? WadGenmidi.WOPL_FLAG_FIXED_NOTE : 0));
        out[target + 40] = dv.getUint8(idata + 6);
        out[target + 41] = dv.getUint8(idata + 22);

        // WOPL operator order: carrier1, modulator1, carrier2, modulator2 —
        // a DMX voice lays out its modulator first (offset 0), carrier at 7.
        WadGenmidi._writeOperator(out, target + 42, dv, idata + 7);
        WadGenmidi._writeOperator(out, target + 47, dv, idata + 0);
        WadGenmidi._writeOperator(out, target + 52, dv, idata + 23);
        WadGenmidi._writeOperator(out, target + 57, dv, idata + 16);
    }

    // A 6-byte DMX operator (AVEKM, AtDec, SusRel, WF, KSL, level) into the
    // 5 raw OPL registers of a WOPL operator (0x20, 0x40, 0x60, 0x80, 0xE0).
    static _writeOperator(out, offset, dv, op) {
        out[offset]     = dv.getUint8(op);
        out[offset + 1] = ((dv.getUint8(op + 4) & 0xC0) | (dv.getUint8(op + 5) & 0x3F));
        out[offset + 2] = dv.getUint8(op + 1);
        out[offset + 3] = dv.getUint8(op + 2);
        out[offset + 4] = dv.getUint8(op + 3);
    }
}

WadGenmidi.MAGIC                 = '#OPL_II#';
WadGenmidi.RECORD_COUNT          = 175;
WadGenmidi.RECORD_SIZE           = 36;
WadGenmidi.NAME_SIZE             = 32;
WadGenmidi.RECORDS_END           = 8 + (WadGenmidi.RECORD_COUNT * WadGenmidi.RECORD_SIZE);
WadGenmidi.PERCUSSION_FIRST_NOTE = 35;
WadGenmidi.DMX_FLAG_FIXED_PITCH  = 0x0001;
WadGenmidi.DMX_FLAG_DOUBLE_VOICE = 0x0004;
WadGenmidi.WOPL_MAGIC            = 'WOPL3-BANK';
WadGenmidi.WOPL_VERSION          = 3;
WadGenmidi.WOPL_VOLUME_MODEL_DMX = 2;
WadGenmidi.WOPL_INST_SIZE        = 66;
WadGenmidi.WOPL_FLAG_4OP         = 0x01;
WadGenmidi.WOPL_FLAG_PSEUDO_4OP  = 0x02;
WadGenmidi.WOPL_FLAG_BLANK       = 0x04;
WadGenmidi.WOPL_FLAG_FIXED_NOTE  = 0x40;
WadGenmidi.WOPL_TOTAL_SIZE       = 19 + (2 * (WadGenmidi.NAME_SIZE + 2)) + (2 * 128 * WadGenmidi.WOPL_INST_SIZE);
