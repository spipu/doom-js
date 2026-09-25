/**
 * Per-map progression of a WAD: which level comes next and which story text
 * closes a chapter.
 *
 * Defaults follow the vanilla G_DoCompleted rules applied to the level codes,
 * the per-game slots coming from the profile's progressionRules:
 * - ExMy: secret exit → ExM9; ExM9 → per-episode return; ExM8 → end of game;
 * - MAPxx: secret exit → secret slot (super-secret from the secret one); both
 *   slots → secret return; MAP30 → end of game;
 * - otherwise lump order; explicitRoutes override the patterns, a target
 *   absent from the WAD falls back to lump order, null means end of game.
 *
 * A UMAPINFO lump (spec rev 2.2) overlays the defaults field by field; unknown
 * keys are skipped. C-style comments, absent from the spec, are tolerated.
 */
class WadMapInfo {
    /**
     * @param {WadFile}             wadFile
     * @param {AbstractGameProfile} profile
     */
    constructor(wadFile, profile = null) {
        this._profile = (profile ?? new DefaultGameProfile());
        this._rules   = this._profile.progressionRules();
        this._levels  = wadFile.getLevelNames();
        this._entries = {};
        for (const name of this._levels) {
            this._entries[name] = {
                next:       this._vanillaNext(name, false),
                nextsecret: this._vanillaNext(name, true),
                levelname:  null,
                // Candidate music lumps, first present wins (the game rules
                // reuse songs across levels; a UMAPINFO music key overrides).
                music:      this._profile.levelMusicLumps(name),
                // True once a UMAPINFO block described the map: it then owns
                // its finale text and the cluster ones no longer apply.
                umapinfo:   false
            };
        }

        const lump = wadFile.getLump('UMAPINFO');
        if (lump === null) {
            return;
        }
        try {
            this._overlayLump(WadFile.lumpText(lump));
        } catch (error) {
            // Keeps the maps overlaid so far, the defaults cover the rest.
            console.warn('WadMapInfo - malformed UMAPINFO lump: ' + error.message);
        }
    }

    /**
     * Next level after an exit.
     *
     * @param {string}  current
     * @param {boolean} secret  true when leaving through a secret exit
     * @returns {string|null} null = end of game (back to the menu)
     */
    nextLevelCode(current, secret) {
        const entry = this._entries[current];
        if (entry === undefined) {
            return null;
        }
        return ((secret === true) ? entry.nextsecret : entry.next);
    }

    /**
     * @param {string} levelCode
     * @returns {string|null} the readable level name, when the lump defines one
     */
    levelNameFor(levelCode) {
        return (this._entries[levelCode]?.levelname ?? null);
    }

    /**
     * @param {string} levelCode
     * @returns {string[]} candidate music lumps of the level, first present wins
     */
    musicLumpsFor(levelCode) {
        return (this._entries[levelCode]?.music ?? []);
    }

    /**
     * Story text shown after this level's tally, transcription of the vanilla
     * rule (UZDoom FLevelLocals::CreateIntermission):
     *  - end of game → the exit text of the CURRENT cluster;
     *  - otherwise, next level in ANOTHER cluster → the enter text of that
     *    cluster, or failing that the exit text of the current one;
     *  - same cluster → nothing, the chapter is not over.
     * A map described in UMAPINFO carries its own text instead and ignores the
     * clusters entirely.
     *
     * @param {string}  current
     * @param {boolean} secret true when leaving through a secret exit
     * @returns {{text: string}|{code: string}|null} a literal text (the WAD's
     *          own, untranslatable), a code to resolve, or no finale at all
     */
    finaleFor(current, secret) {
        const entry = this._entries[current];
        if (entry === undefined) {
            return null;
        }
        if (entry.umapinfo === true) {
            const text = ((secret === true) ? entry.intertextsecret : entry.intertext);

            return ((typeof text === 'string') ? {text: text} : null);
        }

        const clusters = (this._rules.clusters ?? null);
        if (clusters === null) {
            return null;
        }
        const cluster = this._clusterOf(current);
        const exit    = (clusters.texts[cluster]?.exit ?? null);
        const next    = this.nextLevelCode(current, secret);
        if (next === null) {
            return WadMapInfo._finaleCode(exit);
        }
        const nextCluster = this._clusterOf(next);
        if (nextCluster === cluster) {
            return null;
        }

        return WadMapInfo._finaleCode(clusters.texts[nextCluster]?.enter ?? exit);
    }

    // --- Clusters ---

    static _finaleCode(code) {
        return ((code !== null) ? {code: code} : null);
    }

    // Cluster of a level from the profile rules, null outside every cluster
    // (never equal to another level's).
    _clusterOf(name) {
        const clusters = this._rules.clusters;
        const upper    = name.toUpperCase();
        if (clusters.byMapExact[upper] !== undefined) {
            return clusters.byMapExact[upper];
        }
        const code = WadLevelCode.parse(upper);
        if (code.episode !== null) {
            return ((clusters.byEpisode === true) ? code.episode : null);
        }
        if (code.number === null) {
            return null;
        }
        for (const [last, cluster] of clusters.byMapRange) {
            if (code.number <= last) {
                return cluster;
            }
        }

        return null;
    }

    // --- Vanilla defaults ---

    // G_DoCompleted name-pattern rules (see class header).
    _vanillaNext(current, secret) {
        const index = this._levels.indexOf(current);
        const sequential = (((index >= 0) && (index + 1 < this._levels.length)) ? this._levels[index + 1] : null);

        const explicit = (this._rules.explicitRoutes ?? {})[current];
        if (explicit !== undefined) {
            const target = ((secret === true) ? explicit.nextsecret : explicit.next);
            return (((target !== null) && this._levels.includes(target)) ? target : sequential);
        }

        let routed = null;
        const code = WadLevelCode.parse(current);
        if (code.episode !== null) {
            if (!secret && (code.map === this._rules.episodeEndMap)) {
                // Vanilla ends the game on the episode-end map's normal exit
                // (ga_victory); its secret exit still routes to ExM9 below.
                return null;
            }
            if (secret) {
                routed = 'E' + code.episode + 'M9';
            } else if (code.map === 9) {
                routed = this._rules.episodeSecretReturns[code.episode] ?? null;
            }
        } else if (code.number !== null) {
            if (current === this._rules.mapEndSlot) {
                // MAP30 ends the game through both exits (cast call).
                return null;
            }
            if (secret) {
                routed = ((current === this._rules.mapSecretSlot) ? this._rules.mapSuperSecretSlot : this._rules.mapSecretSlot);
            } else if ((current === this._rules.mapSecretSlot) || (current === this._rules.mapSuperSecretSlot)) {
                routed = this._rules.mapSecretReturn;
            }
        }

        return (((routed !== null) && this._levels.includes(routed)) ? routed : sequential);
    }

    // --- UMAPINFO lump ---

    // Sequence of MAP blocks: MAP <name> { key = value[, value…] … }
    _overlayLump(text) {
        const tokens = WadLumpTokenizer.tokenize(text, WadMapInfo.SYMBOLS);
        let i = 0;
        while (i < tokens.length) {
            const word = tokens[i];
            if ((word.type !== 'word') || (word.value.toUpperCase() !== 'MAP')) {
                throw new Error('MAP block expected');
            }
            const name = tokens[i + 1];
            if ((name === undefined) || (name.type !== 'word')) {
                throw new Error('map name expected');
            }
            const brace = tokens[i + 2];
            if ((brace === undefined) || (brace.type !== '{')) {
                throw new Error('{ expected after MAP ' + name.value);
            }
            i = this._overlayBlock(tokens, i + 3, name.value.toUpperCase());
        }
    }

    // Overlays one MAP block onto the map's entry; returns the index of the
    // token after the block.
    _overlayBlock(tokens, i, mapName) {
        const entry = (this._entries[mapName] ?? {next: null, nextsecret: null, levelname: null, music: []});
        const seen  = {nextsecret: false, end: false};
        entry.umapinfo = true;
        while ((i < tokens.length) && (tokens[i].type !== '}')) {
            const key = tokens[i];
            const equal = tokens[i + 1];
            if ((key.type !== 'word') || (equal === undefined) || (equal.type !== '=')) {
                throw new Error('key = value expected in MAP ' + mapName);
            }
            i += 2;
            const values = [];
            while (i < tokens.length) {
                const value = tokens[i];
                if ((value.type !== 'word') && (value.type !== 'string')) {
                    throw new Error('value expected for [' + key.value + '] in MAP ' + mapName);
                }
                values.push(value.value);
                i++;
                if ((tokens[i] === undefined) || (tokens[i].type !== ',')) {
                    break;
                }
                i++;
            }
            this._applyKey(entry, seen, mapName, key.value.toLowerCase(), values);
        }
        if (tokens[i] === undefined) {
            throw new Error('unterminated MAP ' + mapName);
        }

        if (seen.end === true) {
            entry.next       = null;
            entry.nextsecret = null;
        } else if (seen.nextsecret === false) {
            // Spec: an entry without nextsecret routes its secret exit to the
            // normal exit target, even on a map with a natural secret exit.
            entry.nextsecret = entry.next;
        }
        this._entries[mapName] = entry;
        return i + 1;
    }

    _applyKey(entry, seen, mapName, key, values) {
        const first = (values[0] ?? '');
        if ((key === 'next') || (key === 'nextsecret')) {
            const target = first.toUpperCase();
            if (!this._levels.includes(target)) {
                console.warn('WadMapInfo - MAP ' + mapName + ': ' + key + ' [' + target + '] is not a level of this WAD');
                return;
            }
            entry[key] = target;
            if (key === 'nextsecret') {
                seen.nextsecret = true;
            }
        }
        if (key === 'levelname') {
            entry.levelname = first;
        }
        if (key === 'music') {
            entry.music = [first.toUpperCase()];
        }
        // Story text of this map's normal / secret exit, one string per line;
        // a lone "-" states that this exit shows none.
        if ((key === 'intertext') || (key === 'intertextsecret')) {
            entry[key] = ((first === '-') ? null : values.join('\n'));
        }
        // endgame=false only overrides a hard-coded default end (none in this
        // engine, so it stays a no-op); the end* screens all end the game.
        if ((key === 'endgame') || (key === 'endbunny') || (key === 'endcast')) {
            seen.end = (seen.end || (first.toLowerCase() === 'true'));
        }
        if (key === 'endpic') {
            seen.end = true;
        }
    }
}

// Symbols of the UMAPINFO grammar: block braces, key/value and value lists.
WadMapInfo.SYMBOLS = '{}=,';
