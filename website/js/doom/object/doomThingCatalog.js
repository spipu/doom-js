/**
 * Catalog of Doom world THINGS (decorations + pickups) — the single source of
 * truth mapping a Doom editor number to what appears in the world. Decorations
 * are DoomDecoration definitions (sprite + solid + radius + ceiling); pickups
 * carry their sprite + a gameplay `effect` consumed when picked up (phase 3).
 *
 * Enemies, player/DM starts and teleport landings are absent on purpose (not
 * displayed). Sprite = full rotation-0 lump (…A0); animated things list their
 * frames + duration in the table entry. Sprite names/flags follow the Doom Wiki
 * thing-type table. Kept out of DoomGame to avoid bloating it with data.
 */
class DoomThingCatalog {
    constructor() {
        // radius in metres (≈ Doom radius / 64); only used by the collision phase.
        this._decorations = {
            // Floor obstacles (solid)
            barrel:        new DoomDecoration({code: 'barrel',        name: 'Barrel',             sprite: 'BAR1A0', solid: true,  radius: 10 * WadConstants.SCALE}),
            floorLamp:     new DoomDecoration({code: 'floorLamp',     name: 'Floor lamp',         sprite: 'COLUA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            techColumn:    new DoomDecoration({code: 'techColumn',    name: 'Tall techno column', sprite: 'ELECA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            candelabra:    new DoomDecoration({code: 'candelabra',    name: 'Candelabra',         sprite: 'CBRAA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            pillarTallG:   new DoomDecoration({code: 'pillarTallG',   name: 'Tall green pillar',  sprite: 'COL1A0', solid: true,  radius: 16 * WadConstants.SCALE}),
            pillarShortG:  new DoomDecoration({code: 'pillarShortG',  name: 'Short green pillar', sprite: 'COL2A0', solid: true,  radius: 16 * WadConstants.SCALE}),
            pillarTallR:   new DoomDecoration({code: 'pillarTallR',   name: 'Tall red pillar',    sprite: 'COL3A0', solid: true,  radius: 16 * WadConstants.SCALE}),
            pillarShortR:  new DoomDecoration({code: 'pillarShortR',  name: 'Short red pillar',   sprite: 'COL4A0', solid: true,  radius: 16 * WadConstants.SCALE}),
            pillarHeart:   new DoomDecoration({code: 'pillarHeart',   name: 'Pillar with heart',  sprite: 'COL5A0', solid: true,  radius: 16 * WadConstants.SCALE}),
            pillarSkull:   new DoomDecoration({code: 'pillarSkull',   name: 'Pillar with skull',  sprite: 'COL6A0', solid: true,  radius: 16 * WadConstants.SCALE}),
            evilEye:       new DoomDecoration({code: 'evilEye',       name: 'Evil eye',           sprite: 'CEYEA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            floatSkull:    new DoomDecoration({code: 'floatSkull',    name: 'Floating skull',     sprite: 'FSKUA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            burntTree:     new DoomDecoration({code: 'burntTree',     name: 'Burnt tree',         sprite: 'TRE1A0', solid: true,  radius: 16 * WadConstants.SCALE}),
            bigTree:       new DoomDecoration({code: 'bigTree',       name: 'Big brown tree',     sprite: 'TRE2A0', solid: true,  radius: 32 * WadConstants.SCALE}),
            stalagmite:    new DoomDecoration({code: 'stalagmite',    name: 'Stalagmite',         sprite: 'SMITA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            impaledHuman:  new DoomDecoration({code: 'impaledHuman',  name: 'Impaled human',      sprite: 'POL1A0', solid: true,  radius: 16 * WadConstants.SCALE}),
            twitchImpaled: new DoomDecoration({code: 'twitchImpaled', name: 'Twitching impaled',  sprite: 'POL6A0', solid: true,  radius: 16 * WadConstants.SCALE}),
            skullPole:     new DoomDecoration({code: 'skullPole',     name: 'Skull on a pole',    sprite: 'POL4A0', solid: true,  radius: 16 * WadConstants.SCALE}),
            skullKebab:    new DoomDecoration({code: 'skullKebab',    name: 'Skulls kebab',       sprite: 'POL2A0', solid: true,  radius: 16 * WadConstants.SCALE}),
            skullPile:     new DoomDecoration({code: 'skullPile',     name: 'Skulls and candles', sprite: 'POL3A0', solid: true,  radius: 16 * WadConstants.SCALE}),
            burningBarrel: new DoomDecoration({code: 'burningBarrel', name: 'Burning barrel',     sprite: 'FCANA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            tallBlueTorch: new DoomDecoration({code: 'tallBlueTorch', name: 'Tall blue torch',    sprite: 'TBLUA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            tallGreenTorch:new DoomDecoration({code: 'tallGreenTorch',name: 'Tall green torch',   sprite: 'TGRNA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            tallRedTorch:  new DoomDecoration({code: 'tallRedTorch',  name: 'Tall red torch',     sprite: 'TREDA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            shortBlueTorch:new DoomDecoration({code: 'shortBlueTorch',name: 'Short blue torch',   sprite: 'SMBTA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            shortGreenTorch:new DoomDecoration({code: 'shortGreenTorch',name: 'Short green torch',sprite: 'SMGTA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            shortRedTorch: new DoomDecoration({code: 'shortRedTorch', name: 'Short red torch',    sprite: 'SMRTA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            tallTechLamp:  new DoomDecoration({code: 'tallTechLamp',  name: 'Tall techno lamp',   sprite: 'TLMPA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            shortTechLamp: new DoomDecoration({code: 'shortTechLamp', name: 'Short techno lamp',  sprite: 'TLP2A0', solid: true,  radius: 16 * WadConstants.SCALE}),
            // Floor decorations (non-solid)
            candle:        new DoomDecoration({code: 'candle',        name: 'Candle',             sprite: 'CANDA0', solid: false, radius: 0}),
            gibs:          new DoomDecoration({code: 'gibs',          name: 'Bloody mess',        sprite: 'PLAYW0', solid: false, radius: 0}),
            deadPlayer:    new DoomDecoration({code: 'deadPlayer',    name: 'Dead player',        sprite: 'PLAYN0', solid: false, radius: 0}),
            deadFormer:    new DoomDecoration({code: 'deadFormer',    name: 'Dead former human',  sprite: 'POSSL0', solid: false, radius: 0}),
            deadSergeant:  new DoomDecoration({code: 'deadSergeant',  name: 'Dead sergeant',      sprite: 'SPOSL0', solid: false, radius: 0}),
            deadImp:       new DoomDecoration({code: 'deadImp',       name: 'Dead imp',           sprite: 'TROOM0', solid: false, radius: 0}),
            deadDemon:     new DoomDecoration({code: 'deadDemon',     name: 'Dead demon',         sprite: 'SARGN0', solid: false, radius: 0}),
            deadCaco:      new DoomDecoration({code: 'deadCaco',      name: 'Dead cacodemon',     sprite: 'HEADL0', solid: false, radius: 0}),
            gutsPool:      new DoomDecoration({code: 'gutsPool',      name: 'Pool of guts',       sprite: 'POL5A0', solid: false, radius: 0}),
            poolBlood1:    new DoomDecoration({code: 'poolBlood1',    name: 'Pool of blood',      sprite: 'POB1A0', solid: false, radius: 0}),
            poolBlood2:    new DoomDecoration({code: 'poolBlood2',    name: 'Pool of blood',      sprite: 'POB2A0', solid: false, radius: 0}),
            poolBrains:    new DoomDecoration({code: 'poolBrains',    name: 'Pool of brains',     sprite: 'BRS1A0', solid: false, radius: 0}),
            // Ceiling-hung (solid set per type; anchored to the ceiling)
            hangTwitching: new DoomDecoration({code: 'hangTwitching', name: 'Hanging twitching',  sprite: 'GOR1A0', solid: false, radius: 16 * WadConstants.SCALE, ceiling: true}),
            hangArmsOut:   new DoomDecoration({code: 'hangArmsOut',   name: 'Hanging arms out',   sprite: 'GOR2A0', solid: false, radius: 16 * WadConstants.SCALE, ceiling: true}),
            hangOneLeg:    new DoomDecoration({code: 'hangOneLeg',    name: 'Hanging one-legged', sprite: 'GOR3A0', solid: false, radius: 16 * WadConstants.SCALE, ceiling: true}),
            hangLegsPair:  new DoomDecoration({code: 'hangLegsPair',  name: 'Hanging pair of legs',sprite: 'GOR4A0', solid: false, radius: 16 * WadConstants.SCALE, ceiling: true}),
            hangLeg:       new DoomDecoration({code: 'hangLeg',       name: 'Hanging leg',        sprite: 'GOR5A0', solid: false, radius: 16 * WadConstants.SCALE, ceiling: true}),
            hangGuts1:     new DoomDecoration({code: 'hangGuts1',     name: 'Hanging victim guts',sprite: 'HDB1A0', solid: true,  radius: 16 * WadConstants.SCALE, ceiling: true}),
            hangGuts2:     new DoomDecoration({code: 'hangGuts2',     name: 'Hanging guts/brain', sprite: 'HDB2A0', solid: true,  radius: 16 * WadConstants.SCALE, ceiling: true}),
            hangTorso1:    new DoomDecoration({code: 'hangTorso1',    name: 'Hanging torso down', sprite: 'HDB3A0', solid: true,  radius: 16 * WadConstants.SCALE, ceiling: true}),
            hangTorso2:    new DoomDecoration({code: 'hangTorso2',    name: 'Hanging torso open', sprite: 'HDB4A0', solid: true,  radius: 16 * WadConstants.SCALE, ceiling: true}),
            hangTorso3:    new DoomDecoration({code: 'hangTorso3',    name: 'Hanging torso 1leg', sprite: 'HDB5A0', solid: true,  radius: 16 * WadConstants.SCALE, ceiling: true}),
            hangTorso4:    new DoomDecoration({code: 'hangTorso4',    name: 'Hanging torso noleg',sprite: 'HDB6A0', solid: true,  radius: 16 * WadConstants.SCALE, ceiling: true})
        };

        this._thingTypes = {
            // --- Weapons ---
            2001: {kind: 'pickup', sprite: 'SHOTA0', effect: {weapon: 'shotgun'}},
            82:   {kind: 'pickup', sprite: 'SGN2A0', effect: {weapon: 'supershotgun'}},
            2002: {kind: 'pickup', sprite: 'MGUNA0', effect: {weapon: 'chaingun'}},
            2003: {kind: 'pickup', sprite: 'LAUNA0', effect: {weapon: 'rocket'}},
            2004: {kind: 'pickup', sprite: 'PLASA0', effect: {weapon: 'plasma'}},
            2005: {kind: 'pickup', sprite: 'CSAWA0', effect: {weapon: 'chainsaw'}},
            2006: {kind: 'pickup', sprite: 'BFUGA0', effect: {weapon: 'bfg'}},
            // --- Ammo ---
            2007: {kind: 'pickup', sprite: 'CLIPA0', effect: {ammo: 'bullets', amount: 10}},
            2048: {kind: 'pickup', sprite: 'AMMOA0', effect: {ammo: 'bullets', amount: 50}},
            2008: {kind: 'pickup', sprite: 'SHELA0', effect: {ammo: 'shells', amount: 4}},
            2049: {kind: 'pickup', sprite: 'SBOXA0', effect: {ammo: 'shells', amount: 20}},
            2010: {kind: 'pickup', sprite: 'ROCKA0', effect: {ammo: 'rockets', amount: 1}},
            2046: {kind: 'pickup', sprite: 'BROKA0', effect: {ammo: 'rockets', amount: 5}},
            2047: {kind: 'pickup', sprite: 'CELLA0', effect: {ammo: 'cells', amount: 20}},
            17:   {kind: 'pickup', sprite: 'CELPA0', effect: {ammo: 'cells', amount: 100}},
            8:    {kind: 'pickup', sprite: 'BPAKA0', effect: {backpack: true}},
            // --- Health / armor (bonuses + spheres blink) ---
            2011: {kind: 'pickup', sprite: 'STIMA0', effect: {health: 10}},
            2012: {kind: 'pickup', sprite: 'MEDIA0', effect: {health: 25}},
            2014: {kind: 'pickup', sprite: 'BON1A0', frames: this._animFrames('BON1', 'ABCDCB'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {health: 1, overheal: true}},
            2015: {kind: 'pickup', sprite: 'BON2A0', frames: this._animFrames('BON2', 'ABCDCB'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {armorBonus: 1}},
            2018: {kind: 'pickup', sprite: 'ARM1A0', frames: this._animFrames('ARM1', 'AB'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {armor: 'green'}},
            2019: {kind: 'pickup', sprite: 'ARM2A0', frames: this._animFrames('ARM2', 'AB'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {armor: 'blue'}},
            2013: {kind: 'pickup', sprite: 'SOULA0', frames: this._animFrames('SOUL', 'ABCDCB'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {health: 100, overheal: true}},
            83:   {kind: 'pickup', sprite: 'MEGAA0', frames: this._animFrames('MEGA', 'ABCD'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {mega: true}},
            // --- Power-ups ---
            2022: {kind: 'pickup', sprite: 'PINVA0', frames: this._animFrames('PINV', 'ABCD'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {item: 'invulnerability'}},
            2023: {kind: 'pickup', sprite: 'PSTRA0', effect: {item: 'berserk'}},
            2024: {kind: 'pickup', sprite: 'PINSA0', frames: this._animFrames('PINS', 'ABCD'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {item: 'invisibility'}},
            2025: {kind: 'pickup', sprite: 'SUITA0', effect: {item: 'radiationSuit'}},
            2026: {kind: 'pickup', sprite: 'PMAPA0', frames: this._animFrames('PMAP', 'ABCD'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {item: 'computerMap'}},
            2045: {kind: 'pickup', sprite: 'PVISA0', frames: this._animFrames('PVIS', 'AB'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {item: 'lightVisor'}},
            // --- Keys (blink between two frames) ---
            5:    {kind: 'pickup', sprite: 'BKEYA0', frames: this._animFrames('BKEY', 'AB'), animDuration: 7 * WadConstants.SECONDS_PER_TIC, effect: {item: 'blueKey'}},
            13:   {kind: 'pickup', sprite: 'RKEYA0', frames: this._animFrames('RKEY', 'AB'), animDuration: 7 * WadConstants.SECONDS_PER_TIC, effect: {item: 'redKey'}},
            6:    {kind: 'pickup', sprite: 'YKEYA0', frames: this._animFrames('YKEY', 'AB'), animDuration: 7 * WadConstants.SECONDS_PER_TIC, effect: {item: 'yellowKey'}},
            40:   {kind: 'pickup', sprite: 'BSKUA0', frames: this._animFrames('BSKU', 'AB'), animDuration: 7 * WadConstants.SECONDS_PER_TIC, effect: {item: 'blueKey'}},
            39:   {kind: 'pickup', sprite: 'RSKUA0', frames: this._animFrames('RSKU', 'AB'), animDuration: 7 * WadConstants.SECONDS_PER_TIC, effect: {item: 'redKey'}},
            38:   {kind: 'pickup', sprite: 'YSKUA0', frames: this._animFrames('YSKU', 'AB'), animDuration: 7 * WadConstants.SECONDS_PER_TIC, effect: {item: 'yellowKey'}},
            // --- Static floor decorations ---
            2035: {kind: 'decoration', code: 'barrel'},
            2028: {kind: 'decoration', code: 'floorLamp'},
            48:   {kind: 'decoration', code: 'techColumn'},
            35:   {kind: 'decoration', code: 'candelabra'},
            34:   {kind: 'decoration', code: 'candle'},
            30:   {kind: 'decoration', code: 'pillarTallG'},
            31:   {kind: 'decoration', code: 'pillarShortG'},
            32:   {kind: 'decoration', code: 'pillarTallR'},
            33:   {kind: 'decoration', code: 'pillarShortR'},
            37:   {kind: 'decoration', code: 'pillarSkull'},
            43:   {kind: 'decoration', code: 'burntTree'},
            54:   {kind: 'decoration', code: 'bigTree'},
            47:   {kind: 'decoration', code: 'stalagmite'},
            25:   {kind: 'decoration', code: 'impaledHuman'},
            27:   {kind: 'decoration', code: 'skullPole'},
            28:   {kind: 'decoration', code: 'skullKebab'},
            24:   {kind: 'decoration', code: 'gutsPool'},
            79:   {kind: 'decoration', code: 'poolBlood1'},
            80:   {kind: 'decoration', code: 'poolBlood2'},
            81:   {kind: 'decoration', code: 'poolBrains'},
            15:   {kind: 'decoration', code: 'deadPlayer'},
            18:   {kind: 'decoration', code: 'deadFormer'},
            19:   {kind: 'decoration', code: 'deadSergeant'},
            20:   {kind: 'decoration', code: 'deadImp'},
            21:   {kind: 'decoration', code: 'deadDemon'},
            22:   {kind: 'decoration', code: 'deadCaco'},
            10:   {kind: 'decoration', code: 'gibs'},
            12:   {kind: 'decoration', code: 'gibs'},
            // --- Animated floor decorations ---
            36:   {kind: 'decoration', code: 'pillarHeart',     frames: this._animFrames('COL5', 'AB'),    animDuration: 10 * WadConstants.SECONDS_PER_TIC},
            41:   {kind: 'decoration', code: 'evilEye',         frames: this._animFrames('CEYE', 'ABCB'),  animDuration: 6 * WadConstants.SECONDS_PER_TIC},
            42:   {kind: 'decoration', code: 'floatSkull',      frames: this._animFrames('FSKU', 'ABC'),   animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            26:   {kind: 'decoration', code: 'twitchImpaled',   frames: this._animFrames('POL6', 'AB'),    animDuration: 7 * WadConstants.SECONDS_PER_TIC},
            29:   {kind: 'decoration', code: 'skullPile',       frames: this._animFrames('POL3', 'AB'),    animDuration: 7 * WadConstants.SECONDS_PER_TIC},
            70:   {kind: 'decoration', code: 'burningBarrel',   frames: this._animFrames('FCAN', 'ABC'),   animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            44:   {kind: 'decoration', code: 'tallBlueTorch',   frames: this._animFrames('TBLU', 'ABCD'),  animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            45:   {kind: 'decoration', code: 'tallGreenTorch',  frames: this._animFrames('TGRN', 'ABCD'),  animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            46:   {kind: 'decoration', code: 'tallRedTorch',    frames: this._animFrames('TRED', 'ABCD'),  animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            55:   {kind: 'decoration', code: 'shortBlueTorch',  frames: this._animFrames('SMBT', 'ABCD'),  animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            56:   {kind: 'decoration', code: 'shortGreenTorch', frames: this._animFrames('SMGT', 'ABCD'),  animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            57:   {kind: 'decoration', code: 'shortRedTorch',   frames: this._animFrames('SMRT', 'ABCD'),  animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            85:   {kind: 'decoration', code: 'tallTechLamp',    frames: this._animFrames('TLMP', 'ABCD'),  animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            86:   {kind: 'decoration', code: 'shortTechLamp',   frames: this._animFrames('TLP2', 'ABCD'),  animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            // --- Ceiling-hung decorations (solid set per type) ---
            49:   {kind: 'decoration', code: 'hangTwitching', solid: true,  frames: this._animFrames('GOR1', 'ABC'), animDuration: 7 * WadConstants.SECONDS_PER_TIC},
            63:   {kind: 'decoration', code: 'hangTwitching', solid: false, frames: this._animFrames('GOR1', 'ABC'), animDuration: 7 * WadConstants.SECONDS_PER_TIC},
            50:   {kind: 'decoration', code: 'hangArmsOut',   solid: true},
            59:   {kind: 'decoration', code: 'hangArmsOut',   solid: false},
            51:   {kind: 'decoration', code: 'hangOneLeg',    solid: true},
            61:   {kind: 'decoration', code: 'hangOneLeg',    solid: false},
            52:   {kind: 'decoration', code: 'hangLegsPair',  solid: true},
            60:   {kind: 'decoration', code: 'hangLegsPair',  solid: false},
            53:   {kind: 'decoration', code: 'hangLeg',       solid: true},
            62:   {kind: 'decoration', code: 'hangLeg',       solid: false},
            73:   {kind: 'decoration', code: 'hangGuts1'},
            74:   {kind: 'decoration', code: 'hangGuts2'},
            75:   {kind: 'decoration', code: 'hangTorso1'},
            76:   {kind: 'decoration', code: 'hangTorso2'},
            77:   {kind: 'decoration', code: 'hangTorso3'},
            78:   {kind: 'decoration', code: 'hangTorso4'}
        };
    }

    // Build the rotation-0 lump names for an animated sprite, e.g.
    // ('BON1', 'ABCD') → ['BON1A0', 'BON1B0', 'BON1C0', 'BON1D0'].
    _animFrames(base, letters) {
        const result = [];
        for (const ch of letters) {
            result.push(base + ch + '0');
        }
        return result;
    }

    getDecoration(code) {
        return (this._decorations[code] ?? null);
    }

    // Resolve a Doom THING type to a uniform world descriptor, or null if the
    // type is not a displayed thing (enemy, start, teleport landing, unknown).
    getThingForType(type) {
        const entry = this._thingTypes[type];
        if (entry === undefined) {
            return null;
        }
        if (entry.kind === 'decoration') {
            const def = this._decorations[entry.code];
            return {
                kind:         'decoration',
                code:         entry.code,
                frames:       (entry.frames ?? [def.getSprite()]),
                animDuration: (entry.animDuration ?? 0),
                solid:        ((entry.solid !== undefined) ? (entry.solid === true) : def.isSolid()),
                radius:       def.getRadius(),
                ceiling:      def.isCeiling(),
                effect:       null
            };
        }
        return {
            kind:         'pickup',
            code:         null,
            frames:       (entry.frames ?? [entry.sprite]),
            animDuration: (entry.animDuration ?? 0),
            solid:        false,
            radius:       0,
            ceiling:      false,
            effect:       entry.effect
        };
    }
}
