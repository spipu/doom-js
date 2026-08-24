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

WadDehackedStrings.ESCAPES = {n: '\n', t: '\t', r: '\r'};
