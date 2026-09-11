/**
 * Terrain tables of the level: which flats are liquid, and what each of them
 * splashes (transposition of P_ParseTerrain / ParseSplash / ParseTerrain /
 * ParseFloor, p_terrain.cpp).
 *
 * The game profile provides the tables of the original game; a WAD shipping
 * its own TERRAIN lump overlays them entry by entry, the lump always winning
 * as it does for ANIMATED and SWITCHES. A custom WAD can therefore give a
 * splash to flats the original game never had, and take one away by routing a
 * flat to Null.
 *
 * The lump names ZDoom ACTOR classes for the splash pieces, which no engine
 * but ZDoom can instantiate: the known ones map onto the effect templates the
 * profile builds, and anything else resolves to nothing rather than to a
 * guess.
 */
class WadTerrainBank {
    /**
     * @param {WadFile}             wadFile
     * @param {AbstractGameProfile} profile
     */
    constructor(wadFile, profile) {
        this._wadFile  = wadFile;
        this._profile  = profile;

        this._flats    = {};   // flat name (uppercase) → terrain code
        this._terrains = {};   // terrain code → {base?, chunk?, chunkVel?, sound?}
        this._splashes = {};   // splash name (lowercase) → the same shape
        this._liquids  = new Set();   // terrain codes the lump flagged liquid
    }

    init() {
        this._flats    = {...this._profile.terrainFlats()};
        this._terrains = {...this._profile.terrains()};

        const lump = this._wadFile.getLump('TERRAIN');
        if (lump === null) {
            return this;
        }
        try {
            this._overlayLump(WadFile.lumpText(lump));
        } catch (error) {
            // A malformed lump must not break the level conversion: what was
            // overlaid so far is kept, the profile covers the rest.
            console.warn('WadTerrainBank - malformed TERRAIN lump: ' + error.message);
        }

        return this;
    }

    /**
     * @returns {object} flat name (uppercase) → terrain code
     */
    flats() {
        return this._flats;
    }

    /**
     * @returns {object} terrain code → splash definition
     */
    terrains() {
        return this._terrains;
    }

    /**
     * A flat the game gives a terrain to is a liquid: it takes no impact decal.
     *
     * @param {string} name
     * @returns {boolean}
     */
    isLiquid(name) {
        return (this._flats[name.toUpperCase()] !== undefined);
    }

    // Outer grammar: splash / terrain / floor / defaultterrain blocks, wrapped
    // in if<game> … endif conditionals. The lump of another game is skipped
    // whole rather than half-read.
    _overlayLump(text) {
        const tokens = WadLumpTokenizer.tokenize(text, WadTerrainBank.SYMBOLS);
        const cursor = {tokens: tokens, i: 0};
        let skipping = false;
        while (cursor.i < tokens.length) {
            const word = this._word(cursor).toLowerCase();
            if (word === 'endif') {
                skipping = false;
                continue;
            }
            if (WadTerrainBank.GAME_CONDITIONALS.has(word)) {
                skipping = (word.slice(2) !== this._profile.terrainGame());
                continue;
            }
            if (word === 'splash') {
                this._parseSplash(cursor, skipping);
                continue;
            }
            if (word === 'terrain') {
                this._parseTerrain(cursor, skipping);
                continue;
            }
            if (word === 'floor') {
                this._parseFloor(cursor, skipping);
                continue;
            }
            // defaultterrain names the terrain of every flat the lump does not
            // list: read and dropped, since a table of the liquid flats has no
            // way to carry "all the others" and no WAD gives that default a
            // liquid anyway.
            if (word === 'defaultterrain') {
                this._word(cursor);
                continue;
            }
            throw new Error('unknown keyword ' + word);
        }
    }

    // splash <name> [modify] { <key> <value>… }
    _parseSplash(cursor, skipping) {
        const name   = this._word(cursor).toLowerCase();
        const fields = this._parseBlock(cursor);
        if (skipping) {
            return;
        }
        const shifts = {
            xVelShift: this._shift(fields.chunkxvelshift),
            yVelShift: this._shift(fields.chunkyvelshift),
            zVelShift: this._shift(fields.chunkzvelshift),
            baseZVel:  this._number(fields.chunkbasezvel, WadTerrainBank.DEFAULT_BASE_Z_VEL)
        };
        this._splashes[name] = {
            base:     this._template(fields.baseclass),
            chunk:    this._template(fields.chunkclass),
            chunkVel: shifts,
            sound:    (fields.sound ?? null)
        };
    }

    // terrain <name> [modify] { <key> [value]… }; only the splash it plays and
    // its liquid flag concern us, the rest of the block is read and dropped.
    _parseTerrain(cursor, skipping) {
        const name   = this._word(cursor).toLowerCase();
        const fields = this._parseBlock(cursor);
        if (skipping) {
            return;
        }
        const splash = (this._splashes[(fields.splash ?? '').toLowerCase()] ?? null);
        this._terrains[name] = ((splash !== null) ? splash : {});
        if (fields.liquid !== undefined) {
            this._liquids.add(name);
        }
    }

    // floor [optional] <flat> <terrain|Null|None>
    _parseFloor(cursor, skipping) {
        let flat = this._word(cursor);
        if (flat.toLowerCase() === 'optional') {
            flat = this._word(cursor);
        }
        const terrain = this._word(cursor).toLowerCase();
        if (skipping) {
            return;
        }
        // Null routes a flat back to dry ground, and so does a terrain that is
        // neither liquid nor splashing: the table holds the wet flats alone.
        if (this._isWet(terrain)) {
            this._flats[flat.toUpperCase()] = terrain;

            return;
        }
        delete this._flats[flat.toUpperCase()];
    }

    _isWet(terrain) {
        const splash = (this._terrains[terrain] ?? null);
        if (splash === null) {
            return false;
        }

        return (this._liquids.has(terrain) || (Object.keys(splash).length > 0));
    }

    // Body of a splash or terrain block: `key value` pairs, except for the few
    // keywords that are bare flags and take no value. The brace may be
    // preceded by `modify` (which keeps the previous definition's fields
    // instead of resetting them — we overlay either way), and by nothing else:
    // scanning further would silently swallow the entries that follow a block
    // whose brace is missing.
    _parseBlock(cursor) {
        if (this._peek(cursor) === 'modify') {
            cursor.i++;
        }
        if (this._peek(cursor) !== '{') {
            throw new Error('{ expected');
        }
        cursor.i++;
        const fields = {};
        while ((cursor.i < cursor.tokens.length) && (cursor.tokens[cursor.i].type !== '}')) {
            const key = this._word(cursor);
            if (WadTerrainBank.FLAG_KEYWORDS.has(key.toLowerCase())) {
                fields[key.toLowerCase()] = true;
                continue;
            }
            fields[key.toLowerCase()] = this._word(cursor);
        }
        if (cursor.i >= cursor.tokens.length) {
            throw new Error('unterminated block');
        }
        cursor.i++;

        return fields;
    }

    // Type of the token under the cursor, or its lowercased text for a word.
    _peek(cursor) {
        const token = cursor.tokens[cursor.i];
        if (token === undefined) {
            return null;
        }

        return ((token.type === 'word') ? token.value.toLowerCase() : token.type);
    }

    _word(cursor) {
        const token = cursor.tokens[cursor.i];
        if ((token === undefined) || ((token.type !== 'word') && (token.type !== 'string'))) {
            throw new Error('word expected');
        }
        cursor.i++;

        return token.value;
    }

    // The lump writes the "never thrown that way" shift as -1, which the
    // engine reads back into a byte: the 255 sentinel, null here.
    _shift(value) {
        const shift = (this._number(value, WadTerrainBank.DEFAULT_VEL_SHIFT) & 0xff);

        return ((shift === WadTerrainBank.NO_VEL_SHIFT) ? null : shift);
    }

    _number(value, fallback) {
        const parsed = Number(value ?? fallback);

        return ((Number.isFinite(parsed)) ? parsed : fallback);
    }

    // The splash pieces are ZDoom actor classes; only the ones the profiles
    // build an effect template for can be shown.
    _template(className) {
        if (className === undefined) {
            return null;
        }

        return (WadTerrainBank.SPLASH_CLASSES[className.toUpperCase()] ?? null);
    }
}

// Only the block braces stand alone: every other character of the grammar
// belongs to a flat name, a class name or a sound name.
WadTerrainBank.SYMBOLS = '{}';

// SetSplashDefaults (p_terrain.cpp).
WadTerrainBank.DEFAULT_VEL_SHIFT  = 8;
WadTerrainBank.DEFAULT_BASE_Z_VEL = 1;
WadTerrainBank.NO_VEL_SHIFT       = 255;

// if<game> … endif conditionals of the outer grammar.
WadTerrainBank.GAME_CONDITIONALS = new Set(['ifdoom', 'ifheretic', 'ifhexen', 'ifstrife']);

// Keywords carrying no value of their own (GEN_Bool).
WadTerrainBank.FLAG_KEYWORDS = new Set(['liquid', 'noalert', 'allowprotection', 'damageonland']);

// The splash actors of the stock terrain.txt, mapped onto the effect templates
// the profiles declare.
WadTerrainBank.SPLASH_CLASSES = {
    WATERSPLASHBASE: 'waterSplashBase',
    WATERSPLASH:     'waterSplashChunk',
    SLUDGESPLASH:    'sludgeSplashBase',
    SLUDGECHUNK:     'sludgeSplashChunk',
    LAVASPLASH:      'lavaSplashBase',
    LAVASMOKE:       'lavaSmoke'
};
