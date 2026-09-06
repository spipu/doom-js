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
            // Only lumps with content: markers (size 0) may carry an arbitrary
            // filepos that vanilla never reads — no reason to reject the WAD.
            const lump = this._lumps[this._lumps.length - 1];
            if (lump.size > 0 && lump.offset + lump.size > this._buffer.byteLength) {
                throw new WadError('invalid-format', 'Lump [' + lump.name + '] exceeds the file size');
            }
        }

        return this;
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

    /**
     * Fingerprint of a map: its marker, THINGS, LINEDEFS, SIDEDEFS, SECTORS and
     * BEHAVIOR lumps hashed in UZDoom's MapData::GetChecksum order.
     *
     * @param {string} mapName
     * @returns {Promise<string|null>} lowercase hex SHA-256; null for an unknown map or without Web Crypto
     */
    async mapChecksum(mapName) {
        this._requireParsed();
        if ((typeof crypto === 'undefined') || (crypto.subtle === undefined)) {
            return null;
        }
        const mapIndex = this._lumps.findIndex((lump) => (lump.name === mapName));
        if (mapIndex < 0) {
            return null;
        }
        const parts = [this._lumps[mapIndex]];
        for (const name of WadFile.CHECKSUM_LUMPS) {
            const lump = this._mapSubLump(mapIndex, name);
            if (lump !== null) {
                parts.push(lump);
            }
        }
        const bytes = new Uint8Array(parts.reduce((total, lump) => (total + lump.size), 0));
        let offset = 0;
        for (const lump of parts) {
            bytes.set(new Uint8Array(this._buffer, lump.offset, lump.size), offset);
            offset += lump.size;
        }
        const digest = await crypto.subtle.digest('SHA-256', bytes);

        return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    _mapSubLump(mapIndex, name) {
        const end = Math.min(mapIndex + 1 + WadFile.MAX_MAP_SUB_LUMPS, this._lumps.length);
        for (let i = mapIndex + 1; i < end; i++) {
            if (this._lumps[i].name === name) {
                return this._lumps[i];
            }
        }

        return null;
    }

    /**
     * NUL-terminated fixed-width name of the WAD binary formats (lump
     * directory, but also every name field of the map lumps: textures, flats,
     * animation entries). Static: the converter parsers read their own
     * DataView, they have no WadFile instance.
     *
     * @param {DataView} dv
     * @returns {string} raw, unchanged case
     */
    static readName(dv, offset, length) {
        let name = '';
        for (let i = 0; i < length; i++) {
            const charCode = dv.getUint8(offset + i);
            if (charCode === 0) {
                break;
            }
            name += String.fromCharCode(charCode);
        }

        return name;
    }

    /**
     * Whole content of a text lump (UMAPINFO, DEHACKED) as a string, byte for
     * byte. Static for the same reason as readName: the parsers hold a
     * DataView, not a WadFile.
     *
     * @param {DataView} dv
     * @returns {string}
     */
    static lumpText(dv) {
        let text = '';
        for (let i = 0; i < dv.byteLength; i++) {
            text += String.fromCharCode(dv.getUint8(i));
        }

        return text;
    }

    // --- Internal ---

    _readName(offset, length) {
        return WadFile.readName(this._view, offset, length);
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

WadFile.CHECKSUM_LUMPS   = ['THINGS', 'LINEDEFS', 'SIDEDEFS', 'SECTORS', 'BEHAVIOR'];
WadFile.MAX_MAP_SUB_LUMPS = 11;
