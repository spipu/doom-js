/**
 * Binary parser of the map lumps of a level (transposition of the parse_*
 * functions of convert_wad.py). All values little-endian; heights, vertex
 * coordinates, texture offsets and sidedef references are SIGNED Int16.
 *
 * Only deviation from the raw lumps: a sector carries both its raw light
 * (lightRaw) and the display level WadConstants.sectorLightLevel maps it to
 * (light) — see that method for the why.
 */
class WadLevelParser {
    /**
     * @param {WadFile} wadFile
     * @param {string}  levelName
     */
    constructor(wadFile, levelName) {
        this._wadFile   = wadFile;
        this._levelName = levelName;
    }

    /**
     * @returns {{vertexes: number[][], linedefs: object[], sidedefs: object[], sectors: object[], things: object[], reject: Uint8Array|null}}
     */
    parse() {
        const lumps = this._wadFile.getMapLumps(this._levelName);

        for (const required of ['VERTEXES', 'LINEDEFS', 'SIDEDEFS', 'SECTORS', 'THINGS']) {
            if (lumps[required] === undefined) {
                throw new WadError('invalid-format', 'Level ' + this._levelName + ': missing lump ' + required);
            }
        }

        const sectors = this._parseSectors(lumps.SECTORS);

        return {
            vertexes: this._parseVertexes(lumps.VERTEXES),
            linedefs: this._parseLinedefs(lumps.LINEDEFS),
            sidedefs: this._parseSidedefs(lumps.SIDEDEFS),
            sectors:  sectors,
            things:   this._parseThings(lumps.THINGS),
            reject:   this._parseReject(lumps.REJECT, sectors.length)
        };
    }

    // --- Lump parsers ---

    _parseVertexes(dv) {
        const result = [];
        const count = Math.floor(dv.byteLength / 4);
        for (let i = 0; i < count; i++) {
            result.push([dv.getInt16(i * 4, true), dv.getInt16(i * 4 + 2, true)]);
        }

        return result;
    }

    _parseLinedefs(dv) {
        const result = [];
        const count = Math.floor(dv.byteLength / 14);
        for (let i = 0; i < count; i++) {
            const o = i * 14;
            result.push({
                v1:      dv.getUint16(o, true),
                v2:      dv.getUint16(o + 2, true),
                flags:   dv.getUint16(o + 4, true),
                special: dv.getUint16(o + 6, true),
                tag:     dv.getUint16(o + 8, true),
                right:   dv.getInt16(o + 10, true),
                left:    dv.getInt16(o + 12, true)
            });
        }

        return result;
    }

    _parseSidedefs(dv) {
        const result = [];
        const count = Math.floor(dv.byteLength / 30);
        for (let i = 0; i < count; i++) {
            const o = i * 30;
            result.push({
                xo:     dv.getInt16(o, true),
                yo:     dv.getInt16(o + 2, true),
                upper:  this._readName(dv, o + 4, 8),
                lower:  this._readName(dv, o + 12, 8),
                middle: this._readName(dv, o + 20, 8),
                sector: dv.getUint16(o + 28, true)
            });
        }

        return result;
    }

    _parseSectors(dv) {
        const result = [];
        const count = Math.floor(dv.byteLength / 26);
        for (let i = 0; i < count; i++) {
            const o = i * 26;
            const lightRaw = dv.getUint16(o + 20, true);
            result.push({
                fh:       dv.getInt16(o, true),
                ch:       dv.getInt16(o + 2, true),
                ft:       this._readName(dv, o + 4, 8),
                ct:       this._readName(dv, o + 12, 8),
                // light = the baked display level (WadConstants.sectorLightLevel);
                // lightRaw = the lump value, for the light thinkers' vanilla
                // bounds — they convert their own steps through the same curve.
                light:    WadConstants.sectorLightLevel(lightRaw),
                lightRaw: lightRaw,
                special:  dv.getUint16(o + 22, true),
                tag:      dv.getUint16(o + 24, true)
            });
        }

        return result;
    }

    _parseThings(dv) {
        const result = [];
        const count = Math.floor(dv.byteLength / 10);
        for (let i = 0; i < count; i++) {
            const o = i * 10;
            result.push({
                x:     dv.getInt16(o, true),
                y:     dv.getInt16(o + 2, true),
                angle: dv.getUint16(o + 4, true),
                type:  dv.getUint16(o + 6, true),
                flags: dv.getUint16(o + 8, true)
            });
        }

        return result;
    }

    // REJECT: bit-packed sector×sector table (bit set = the pair can never see
    // each other), used as a sight-check early-out. Optional and untrusted: an
    // absent or too-short lump yields null and the sight code skips it.
    _parseReject(dv, numSectors) {
        if (dv === undefined) {
            return null;
        }
        const needed = Math.ceil(numSectors * numSectors / 8);
        if ((needed === 0) || (dv.byteLength < needed)) {
            return null;
        }
        return new Uint8Array(dv.buffer, dv.byteOffset, needed);
    }

    _readName(dv, offset, length) {
        let name = '';
        for (let i = 0; i < length; i++) {
            const charCode = dv.getUint8(offset + i);
            if (charCode === 0) {
                break;
            }
            name += String.fromCharCode(charCode);
        }

        return name.toUpperCase();
    }
}
