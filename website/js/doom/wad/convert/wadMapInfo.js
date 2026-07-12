/**
 * Per-map progression of a WAD — the single owner of "which level comes next".
 *
 * Every level of the WAD gets a default entry synthesized from the vanilla
 * engine rules (G_DoCompleted applied to the level names, since the original
 * WAD format carries no progression data):
 * - ExMy: secret exit → ExM9; normal exit from ExM9 → per-episode return
 *   (EPISODE_SECRET_RETURN); otherwise sequential lump order.
 * - MAPxx: secret exit → MAP31 (MAP32 when already on MAP31); normal exit
 *   from MAP31/MAP32 → MAP16; otherwise sequential lump order.
 * - A routed target absent from the WAD falls back to sequential; a null
 *   target means end of game (back to the menu).
 *
 * When the WAD provides a UMAPINFO lump (cross-port spec rev 2.2), its
 * entries overlay the defaults field by field: next / nextsecret (a lump
 * entry without nextsecret routes its secret exit to the NORMAL target, per
 * spec — even on a map with a natural secret exit; a target absent from the
 * WAD is ignored with a warning), endgame / endpic / endbunny / endcast
 * (end of game: both exits → null), levelname (HUD display). Every other
 * key is parsed and skipped. The spec does not define comments, but real
 * lumps carry C-style ones — // and slash-star blocks are tolerated.
 */
class WadMapInfo {
    // Vanilla map entered when leaving the secret ExM9 of each episode.
    static EPISODE_SECRET_RETURN = {1: 'E1M4', 2: 'E2M6', 3: 'E3M7', 4: 'E4M3'};

    /**
     * @param {WadFile} wadFile
     */
    constructor(wadFile) {
        this._levels  = wadFile.getLevelNames();
        this._entries = {};
        for (const name of this._levels) {
            this._entries[name] = {
                next:       WadMapInfo._vanillaNext(this._levels, name, false),
                nextsecret: WadMapInfo._vanillaNext(this._levels, name, true),
                levelname:  null
            };
        }

        const lump = wadFile.getLump('UMAPINFO');
        if (lump === null) {
            return;
        }
        try {
            this._overlayLump(WadMapInfo._lumpText(lump));
        } catch (error) {
            // A malformed lump must not break the level conversion: the maps
            // overlaid so far are kept, the defaults cover the rest.
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
    nextLevelName(current, secret) {
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

    // --- Vanilla defaults ---

    // G_DoCompleted rules applied to the WAD level names (see class header).
    static _vanillaNext(levels, current, secret) {
        const index = levels.indexOf(current);
        const sequential = ((index >= 0 && index + 1 < levels.length) ? levels[index + 1] : null);

        let routed = null;
        const episodic = current.match(/^E(\d)M(\d)$/);
        const doom2 = current.match(/^MAP(\d{2})$/);
        if (episodic !== null) {
            const [, episode, map] = episodic;
            if (secret) {
                routed = 'E' + episode + 'M9';
            } else if (map === '9') {
                routed = WadMapInfo.EPISODE_SECRET_RETURN[episode] ?? null;
            }
        } else if (doom2 !== null) {
            const map = parseInt(doom2[1], 10);
            if (secret) {
                routed = ((map === 31) ? 'MAP32' : 'MAP31');
            } else if (map === 31 || map === 32) {
                routed = 'MAP16';
            }
        }

        return ((routed !== null && levels.includes(routed)) ? routed : sequential);
    }

    // --- UMAPINFO lump ---

    static _lumpText(view) {
        let text = '';
        for (let i = 0; i < view.byteLength; i++) {
            text += String.fromCharCode(view.getUint8(i));
        }
        return text;
    }

    // Sequence of MAP blocks: MAP <name> { key = value[, value…] … }
    _overlayLump(text) {
        const tokens = WadMapInfo._tokenize(text);
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

    // Body of one MAP block, overlaid onto the map's default entry (created on
    // the fly for a map absent from the WAD — harmless, it is never current).
    // Returns the index of the token following the block.
    _overlayBlock(tokens, i, mapName) {
        const entry = (this._entries[mapName] ?? {next: null, nextsecret: null, levelname: null});
        const seen  = {nextsecret: false, end: false};
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
                // An authoring error must not crash the chain: keep the default.
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
        // endgame=false only overrides a hard-coded default end (none in this
        // engine, so it stays a no-op); the end* screens all end the game.
        if ((key === 'endgame') || (key === 'endbunny') || (key === 'endcast')) {
            seen.end = (seen.end || (first.toLowerCase() === 'true'));
        }
        if (key === 'endpic') {
            seen.end = true;
        }
    }

    // Lexer: quoted strings, single-char symbols {}=, and bare words
    // (identifiers, numbers, map names). Control chars are whitespace.
    static _tokenize(text) {
        const symbols = '{}=,';
        const tokens = [];
        let i = 0;
        while (i < text.length) {
            const c = text[i];
            if ((c === '/') && (text[i + 1] === '/')) {
                while ((i < text.length) && (text[i] !== '\n')) {
                    i++;
                }
                continue;
            }
            if ((c === '/') && (text[i + 1] === '*')) {
                const end = text.indexOf('*/', i + 2);
                i = ((end === -1) ? text.length : end + 2);
                continue;
            }
            if (text.charCodeAt(i) <= 32) {
                i++;
                continue;
            }
            if (c === '"') {
                const end = text.indexOf('"', i + 1);
                if (end === -1) {
                    throw new Error('unterminated string');
                }
                tokens.push({type: 'string', value: text.slice(i + 1, end)});
                i = end + 1;
                continue;
            }
            if (symbols.indexOf(c) !== -1) {
                tokens.push({type: c});
                i++;
                continue;
            }
            let j = i;
            while (j < text.length) {
                const cj = text[j];
                if ((text.charCodeAt(j) <= 32) || (symbols.indexOf(cj) !== -1) || (cj === '"')) {
                    break;
                }
                if ((cj === '/') && ((text[j + 1] === '/') || (text[j + 1] === '*'))) {
                    break;
                }
                j++;
            }
            tokens.push({type: 'word', value: text.slice(i, j)});
            i = j;
        }
        return tokens;
    }
}
