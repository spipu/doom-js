/**
 * The [STRINGS] section of a WAD's DEHACKED lump (BEX format): the texts a WAD
 * substitutes for the engine's own, keyed by the vanilla string codes.
 *
 * This is what lets a game ship its own story without any transcription on our
 * side — Freedoom redefines E1TEXT, C1TEXT… in its two IWADs. It is also why
 * UZDoom declares those codes EMPTY in language.def: "needed in the string
 * table only so that they can be replaced by Dehacked".
 *
 * Transcription of PatchStrings (d_dehacked.cpp): 'CODE = value', each fragment
 * trimmed on both sides and appended to the previous one while the line ends
 * with a backslash. Only the BEX [STRINGS] section is read — neither the old
 * format's 'Text' blocks, which replace strings by byte offset, nor the rest of
 * DEHACKED (things, frames, weapons), which is another story entirely.
 */
class WadDehackedStrings {
    /**
     * @param {WadFile} wadFile
     */
    constructor(wadFile) {
        // Prototype-less: the codes come from the WAD, and a '__proto__' entry
        // must be stored as a plain value, never mutate the prototype chain.
        this._strings = Object.create(null);

        const lump = wadFile.getLump('DEHACKED');
        if (lump !== null) {
            this._parse(WadFile.lumpText(lump));
        }
    }

    /**
     * @param {string} code e.g. 'E1TEXT'
     * @returns {string|null} null when the WAD redefines nothing under it
     */
    get(code) {
        return (this._strings[code] ?? null);
    }

    /**
     * The WAD's replacement of a level's HUSTR string, without the "E1M1: " /
     * "level 1: " prefix the vanilla strings carry (Freedoom names its levels
     * this way). An empty name counts as none.
     *
     * @param {string} levelCode e.g. 'E1M1' or 'MAP01'
     * @returns {string|null}
     */
    levelName(levelCode) {
        const key = WadDehackedStrings.levelNameKey(levelCode);
        const text = ((key !== null) ? this.get(key) : null);
        if (text === null) {
            return null;
        }
        const name = text.replace(WadDehackedStrings.LEVEL_NAME_PREFIX, '').trim();

        return ((name !== '') ? name : null);
    }

    // HUSTR_E1M1 for the episodic games, HUSTR_1..HUSTR_32 for the MAPxx ones.
    static levelNameKey(levelCode) {
        if (/^E\dM\d$/.test(levelCode)) {
            return ('HUSTR_' + levelCode);
        }
        const map = /^MAP(\d\d)$/.exec(levelCode);

        return ((map !== null) ? ('HUSTR_' + parseInt(map[1], 10)) : null);
    }

    // --- Internal ---

    _parse(text) {
        const lines = text.split(/\r?\n/);
        let inStrings = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // A section header stands alone on its line: the Freedoom lump
            // also MENTIONS [STRINGS] inside a comment before the real one.
            // Matched whatever its case, like the vanilla HandleMode stricmp.
            if ((/^\[[A-Za-z]+\]$/).test(line)) {
                inStrings = (line.toUpperCase() === '[STRINGS]');
                continue;
            }
            if (!inStrings || (line === '') || line.startsWith('#')) {
                continue;
            }
            const equal = line.indexOf('=');
            if (equal < 0) {
                continue;
            }
            const code = line.slice(0, equal).trim();
            let value  = line.slice(equal + 1).trim();
            while (value.endsWith('\\') && ((i + 1) < lines.length)) {
                i++;
                value = value.slice(0, -1) + lines[i].trim();
            }
            this._strings[code] = WadDehackedStrings._unescape(value);
        }
    }

    // ReplaceSpecialChars: an unknown escape yields the character itself, so
    // '\\' gives a backslash. The numeric forms (\x41, \101) are left alone —
    // no game text uses them.
    static _unescape(value) {
        return value.replace(/\\(.)/g, (match, char) => (WadDehackedStrings.ESCAPES[char.toLowerCase()] ?? char));
    }
}

WadDehackedStrings.ESCAPES           = {n: '\n', t: '\t', r: '\r'};
WadDehackedStrings.LEVEL_NAME_PREFIX = /^(?:E\dM\d|level \d+):\s*/i;
