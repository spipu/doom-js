/**
 * Animated texture sequences (transposition of load_anim_sequences /
 * _parse_animated_lump / build_anim_groups of convert_wad.py).
 *
 * Reads the Boom ANIMATED lump if present, otherwise falls back to the
 * vanilla Doom hardcoded sequences (p_spec.c, speed = 8 tics).
 */
class WadAnimationBank {
    /**
     * @param {WadFile}        wadFile
     * @param {WadTextureBank} textureBank
     */
    constructor(wadFile, textureBank) {
        this._wadFile = wadFile;
        this._bank    = textureBank;

        this._sequences = [];   // [{isFlat, frames, speedTics}]
    }

    init() {
        const dv = this._wadFile.getLump('ANIMATED');
        if (dv !== null) {
            this._sequences = this._parseAnimatedLump(dv);
        }
        if (this._sequences.length === 0) {
            this._sequences = this._vanillaSequences();
        }

        return this;
    }

    /**
     * Append the animation frame siblings to a local texture list and build the
     * face-level animation map (equiv. build_anim_groups).
     *
     * @param {int[]} localIndices - bank indices (0-based) of the object textures
     * @returns {{newList: int[], animMap: object}} animMap: local 1-based first
     *          frame id → {ids: local 1-based ids, duration: seconds per frame}
     */
    buildAnimGroups(localIndices) {
        const nameToIdx = {};
        for (let i = 0; i < localIndices.length; i++) {
            nameToIdx[this._bank.getName(localIndices[i])] = i + 1;
        }

        const newList = [...localIndices];
        const animMap = {};

        for (const sequence of this._sequences) {
            if (!sequence.frames.some((f) => nameToIdx[f] !== undefined)) {
                continue;
            }
            for (const name of sequence.frames) {
                if (nameToIdx[name] !== undefined) {
                    continue;
                }
                const bankIndex = ((sequence.isFlat) ? this._bank.ensureFlatTex(name) : this._bank.ensureWallTex(name));
                if (bankIndex >= 0) {
                    nameToIdx[name] = newList.length + 1;
                    newList.push(bankIndex);
                }
            }
            const ids = sequence.frames.filter((f) => nameToIdx[f] !== undefined).map((f) => nameToIdx[f]);
            if (ids.length > 1) {
                // Guard a malformed/zero speed (would give a 0/NaN frame duration);
                // fall back to the vanilla default of 8 tics.
                const tics = ((sequence.speedTics > 0) ? sequence.speedTics : WadConstants.ANIM_DEFAULT_SPEED_TICS);
                animMap[ids[0]] = {ids: ids, duration: tics * WadConstants.SECONDS_PER_TIC};
            }
        }

        return {newList: newList, animMap: animMap};
    }

    /**
     * Loader ids of the full animation sequence a flat belongs to (single
     * entry when the flat is static), plus the frame duration. Runtime flat
     * swaps ("+change" floors) need them: the old faces may carry ANY frame
     * of an animated flat, and the destination must stay animated when it is
     * one (e.g. a change to FWATER).
     *
     * @returns {{ids: int[], duration: number}} ids = engine loader ids
     */
    flatSequenceLoaderIds(flatName) {
        const seq = this._sequences.find((s) => s.isFlat && s.frames.includes(flatName));
        const frames = ((seq !== undefined) ? seq.frames : [flatName]);
        const ids = [];
        for (const name of frames) {
            const idx = this._bank.ensureFlatTex(name);
            if (idx >= 0) {
                ids.push(this._bank.getLoaderId(idx));
            }
        }
        const tics = ((seq !== undefined && seq.speedTics > 0) ? seq.speedTics : WadConstants.ANIM_DEFAULT_SPEED_TICS);

        return {ids: ids, duration: tics * WadConstants.SECONDS_PER_TIC};
    }

    // --- Internal ---

    /**
     * Parse a Boom ANIMATED lump: 23-byte records, type(1) + last(9) + first(9)
     * + speed(4), type 0xFF = end marker, 0 = flat, 1 = wall texture.
     * first→last ranges are expanded on the ordered name lists from the WAD.
     */
    _parseAnimatedLump(dv) {
        const flatNames = this._bank.getOrderedFlatNames();
        const wallNames = this._bank.getOrderedWallNames();

        const sequences = [];
        let i = 0;
        while (i < dv.byteLength) {
            const typeByte = dv.getUint8(i);
            if (typeByte === 0xFF) {
                break;
            }
            if (i + 23 > dv.byteLength) {
                break;
            }
            const isFlat    = (typeByte === 0);
            const lastName  = this._readName(dv, i + 1, 9);
            const firstName = this._readName(dv, i + 10, 9);
            const speedTics = dv.getUint32(i + 19, true);
            i += 23;

            const nameList = ((isFlat) ? flatNames : wallNames);
            const fi = nameList.indexOf(firstName);
            const li = nameList.indexOf(lastName);
            if (fi === -1 || li === -1 || li < fi) {
                continue;
            }
            const frames = nameList.slice(fi, li + 1);
            if (frames.length > 1) {
                sequences.push({isFlat: isFlat, frames: frames, speedTics: speedTics});
            }
        }

        return sequences;
    }

    _vanillaSequences() {
        const raw = [
            [true,  ['NUKAGE1', 'NUKAGE2', 'NUKAGE3']],
            [true,  ['FWATER1', 'FWATER2', 'FWATER3', 'FWATER4']],
            [true,  ['SWATER1', 'SWATER2', 'SWATER3', 'SWATER4']],
            [true,  ['LAVA1', 'LAVA2', 'LAVA3', 'LAVA4']],
            [true,  ['BLOOD1', 'BLOOD2', 'BLOOD3']],
            [true,  ['RROCK05', 'RROCK06', 'RROCK07', 'RROCK08']],
            [true,  ['SLIME01', 'SLIME02', 'SLIME03', 'SLIME04']],
            [true,  ['SLIME05', 'SLIME06', 'SLIME07', 'SLIME08']],
            [true,  ['SLIME09', 'SLIME10', 'SLIME11', 'SLIME12']],
            [false, ['BLODGR1', 'BLODGR2', 'BLODGR3', 'BLODGR4']],
            [false, ['SLADRIP1', 'SLADRIP2', 'SLADRIP3']],
            [false, ['BLODRIP1', 'BLODRIP2', 'BLODRIP3', 'BLODRIP4']],
            [false, ['FIREWALA', 'FIREWALB', 'FIREWALL']],
            [false, ['GSTFONT1', 'GSTFONT2', 'GSTFONT3']],
            [false, ['FIRELAV3', 'FIRELAVA']],
            [false, ['FIREMAG1', 'FIREMAG2', 'FIREMAG3']],
            [false, ['FIREBLU1', 'FIREBLU2']],
            [false, ['ROCKRED1', 'ROCKRED2', 'ROCKRED3']],
            [false, ['BFALL1', 'BFALL2', 'BFALL3', 'BFALL4']],
            [false, ['SFALL1', 'SFALL2', 'SFALL3', 'SFALL4']],
            [false, ['WFALL1', 'WFALL2', 'WFALL3', 'WFALL4']],
            [false, ['DBRAIN1', 'DBRAIN2', 'DBRAIN3', 'DBRAIN4']]
        ];

        return raw.map((entry) => ({isFlat: entry[0], frames: entry[1], speedTics: 8}));
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
