/**
 * Binary reader of a Doom WAD file (transposition of the WAD class of convert_wad.py).
 *
 * Binary layout (little-endian):
 *  - header: 4 bytes magic ('IWAD' or 'PWAD'), uint32 lump count, uint32 directory offset
 *  - directory entry (16 bytes): uint32 lump offset, uint32 lump size, 8 bytes ASCII name padded with \0
 */
class WadFile {
    /**
     * @param {ArrayBuffer} arrayBuffer
     */
    constructor(arrayBuffer) {
        this._buffer = arrayBuffer;
        this._view   = new DataView(arrayBuffer);
        this._type   = null;
        this._lumps  = null;
    }

    parse() {
        if (this._buffer.byteLength < 12) {
            throw new WadError('invalid-format', 'File too small to be a WAD');
        }

        const magic = this._readName(0, 4);
        if (magic !== 'IWAD' && magic !== 'PWAD') {
            throw new WadError('invalid-format', 'Invalid WAD magic: ' + magic);
        }

        const lumpCount = this._view.getUint32(4, true);
        const dirOffset = this._view.getUint32(8, true);
        if (dirOffset + lumpCount * 16 > this._buffer.byteLength) {
            throw new WadError('invalid-format', 'Invalid WAD directory');
        }

        this._type = magic;
        this._lumps = [];
        for (let i = 0; i < lumpCount; i++) {
            const entryOffset = dirOffset + i * 16;
            this._lumps.push({
                name:   this._readName(entryOffset + 8, 8),
                offset: this._view.getUint32(entryOffset, true),
                size:   this._view.getUint32(entryOffset + 4, true)
            });
        }

        return this;
    }

    getType() {
        this._requireParsed();

        return this._type;
    }

    getLumpCount() {
        this._requireParsed();

        return this._lumps.length;
    }

    getLumps() {
        this._requireParsed();

        return this._lumps;
    }

    /**
     * Return a DataView on the content of a lump (equiv. WAD.get).
     *
     * @param {string} name
     * @returns {DataView|null}
     */
    getLump(name) {
        this._requireParsed();

        for (const lump of this._lumps) {
            if (lump.name === name) {
                return this._lumpView(lump);
            }
        }

        return null;
    }

    /**
     * Return all the level names: any lump immediately followed by a THINGS lump
     * (generalization of WAD.first_map_name).
     *
     * @returns {string[]}
     */
    getLevelNames() {
        this._requireParsed();

        const names = [];
        for (let i = 0; i + 1 < this._lumps.length; i++) {
            if (this._lumps[i + 1].name === 'THINGS') {
                names.push(this._lumps[i].name);
            }
        }

        return names;
    }

    /**
     * Return all non-empty lumps located between two marker lumps (equiv. WAD.get_between).
     *
     * @param {string} startName
     * @param {string} endName
     * @returns {Object<string, DataView>}
     */
    getLumpsBetween(startName, endName) {
        this._requireParsed();

        const result = {};
        let active = false;
        for (const lump of this._lumps) {
            if (lump.name === startName) {
                active = true;
                continue;
            }
            if (lump.name === endName) {
                active = false;
                continue;
            }
            if (active && lump.size > 0) {
                result[lump.name] = this._lumpView(lump);
            }
        }

        return result;
    }

    /**
     * Return the sub-lumps of a map (THINGS, LINEDEFS, …) in order (equiv. WAD.get_map_lumps).
     *
     * @param {string} mapName
     * @returns {Object<string, DataView>}
     */
    getMapLumps(mapName) {
        this._requireParsed();

        const order = [
            'THINGS', 'LINEDEFS', 'SIDEDEFS', 'VERTEXES', 'SEGS',
            'SSECTORS', 'NODES', 'SECTORS', 'REJECT', 'BLOCKMAP'
        ];

        const result = {};
        let found = false;
        for (const lump of this._lumps) {
            if (lump.name === mapName) {
                found = true;
                continue;
            }
            if (found) {
                if (!order.includes(lump.name)) {
                    break;
                }
                result[lump.name] = this._lumpView(lump);
            }
        }

        return result;
    }

    // --- Internal ---

    _readName(offset, length) {
        let name = '';
        for (let i = 0; i < length; i++) {
            const charCode = this._view.getUint8(offset + i);
            if (charCode === 0) {
                break;
            }
            name += String.fromCharCode(charCode);
        }

        return name;
    }

    _lumpView(lump) {
        return new DataView(this._buffer, lump.offset, lump.size);
    }

    _requireParsed() {
        if (this._lumps === null) {
            throw new WadError('invalid-format', 'WAD file not parsed - call parse() first');
        }
    }
}
