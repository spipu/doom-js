/**
 * Default profile — the generic doom-format behaviour, and the fallback of
 * GameProfileList (never probed by matchesWad: any WAD without a recognized
 * signature is treated as a plain doom-format WAD). The WadConstants tables
 * are transcribed from the vanilla Doom sources, so this profile translates
 * no special; its progression rules are the vanilla G_DoCompleted patterns
 * that every doom-format PWAD expects (ExMy secret → ExM9, MAP31/32 → MAP16),
 * and its catalogs (things, weapons, ammo, items, loadout, HUD layout) are
 * the vanilla Doom ones.
 */
class DefaultGameProfile extends AbstractGameProfile {
    getCode() {
        return 'default';
    }

    progressionRules() {
        return {
            // Map entered when leaving the secret ExM9 of each episode
            episodeSecretReturns: {1: 'E1M4', 2: 'E2M6', 3: 'E3M7', 4: 'E4M3'},
            // ExM<n> whose NORMAL exit ends the game (vanilla ga_victory);
            // its secret exit still routes to ExM9
            episodeEndMap: 8,
            // MAPxx secret slots and where their normal exit returns
            mapSecretSlot:      'MAP31',
            mapSuperSecretSlot: 'MAP32',
            mapSecretReturn:    'MAP16',
            // MAPxx whose BOTH exits end the game (cast call)
            mapEndSlot:         'MAP30',
            // Per-map route overrides {name: {next, nextsecret}} — pattern
            // exceptions like the Heretic hidden-episode loop
            explicitRoutes:     {}
        };
    }

    // An unknown doom-format WAD gets no episode names (bare numbered
    // entries) — the id titles belong to the Doom profile, not the fallback.
    episodeNames() {
        return {};
    }

    // Transcription of the A_BossDeath switch (linuxdoom p_enemy.c): specials
    // 38 = lowerFloorToLowest, 109 = blazeOpen, 30 = raiseToTexture. E2M8 and
    // E3M8 fall through to G_ExitLevel — their only exit.
    bossActions() {
        return {
            'E1M8':    {special: 38,  tag: 666},
            'E2M8':    {exit: true},
            'E3M8':    {exit: true},
            'E4M6':    {special: 109, tag: 666},
            'E4M8':    {special: 38,  tag: 666},
            'MAP07-1': {special: 38,  tag: 666},
            'MAP07-2': {special: 30,  tag: 667}
        };
    }

    bfgDecalShade() {
        return [128, 255, 128];
    }

    // World things of the Doom family: decoration definitions (radius in
    // metres, ≈ Doom radius / 64 — only used by the collision phase) and the
    // editor-number table. Sprite names/flags follow the Doom Wiki thing-type
    // table; animated things list their frames + duration per entry.
    thingDecorations() {
        return {
            // Floor obstacles (solid)
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
            tallGreenTorch: new DoomDecoration({code: 'tallGreenTorch', name: 'Tall green torch',   sprite: 'TGRNA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            tallRedTorch:  new DoomDecoration({code: 'tallRedTorch',  name: 'Tall red torch',     sprite: 'TREDA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            shortBlueTorch: new DoomDecoration({code: 'shortBlueTorch', name: 'Short blue torch',   sprite: 'SMBTA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            shortGreenTorch: new DoomDecoration({code: 'shortGreenTorch', name: 'Short green torch', sprite: 'SMGTA0', solid: true,  radius: 16 * WadConstants.SCALE}),
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
            hangLegsPair:  new DoomDecoration({code: 'hangLegsPair',  name: 'Hanging pair of legs', sprite: 'GOR4A0', solid: false, radius: 16 * WadConstants.SCALE, ceiling: true}),
            hangLeg:       new DoomDecoration({code: 'hangLeg',       name: 'Hanging leg',        sprite: 'GOR5A0', solid: false, radius: 16 * WadConstants.SCALE, ceiling: true}),
            hangGuts1:     new DoomDecoration({code: 'hangGuts1',     name: 'Hanging victim guts', sprite: 'HDB1A0', solid: true,  radius: 16 * WadConstants.SCALE, ceiling: true}),
            hangGuts2:     new DoomDecoration({code: 'hangGuts2',     name: 'Hanging guts/brain', sprite: 'HDB2A0', solid: true,  radius: 16 * WadConstants.SCALE, ceiling: true}),
            hangTorso1:    new DoomDecoration({code: 'hangTorso1',    name: 'Hanging torso down', sprite: 'HDB3A0', solid: true,  radius: 16 * WadConstants.SCALE, ceiling: true}),
            hangTorso2:    new DoomDecoration({code: 'hangTorso2',    name: 'Hanging torso open', sprite: 'HDB4A0', solid: true,  radius: 16 * WadConstants.SCALE, ceiling: true}),
            hangTorso3:    new DoomDecoration({code: 'hangTorso3',    name: 'Hanging torso 1leg', sprite: 'HDB5A0', solid: true,  radius: 16 * WadConstants.SCALE, ceiling: true}),
            hangTorso4:    new DoomDecoration({code: 'hangTorso4',    name: 'Hanging torso noleg', sprite: 'HDB6A0', solid: true,  radius: 16 * WadConstants.SCALE, ceiling: true})
        };
    }

    thingTypes() {
        return {
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
            2014: {kind: 'pickup', sprite: 'BON1A0', frames: DoomThingCatalog.animFrames('BON1', 'ABCDCB'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {health: 1, overheal: true}},
            2015: {kind: 'pickup', sprite: 'BON2A0', frames: DoomThingCatalog.animFrames('BON2', 'ABCDCB'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {armorBonus: 1, absorb: (1 / 3)}},
            2018: {kind: 'pickup', sprite: 'ARM1A0', frames: DoomThingCatalog.animFrames('ARM1', 'AB'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {armor: {points: 100, absorb: (1 / 3)}}},
            2019: {kind: 'pickup', sprite: 'ARM2A0', frames: DoomThingCatalog.animFrames('ARM2', 'AB'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {armor: {points: 200, absorb: 0.5}}},
            2013: {kind: 'pickup', sprite: 'SOULA0', frames: DoomThingCatalog.animFrames('SOUL', 'ABCDCB'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {health: 100, overheal: true}},
            83:   {kind: 'pickup', sprite: 'MEGAA0', frames: DoomThingCatalog.animFrames('MEGA', 'ABCD'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {mega: {health: 200, armor: {points: 200, absorb: 0.5}}}},
            // --- Power-ups ---
            2022: {kind: 'pickup', sprite: 'PINVA0', frames: DoomThingCatalog.animFrames('PINV', 'ABCD'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {item: 'invulnerability'}},
            2023: {kind: 'pickup', sprite: 'PSTRA0', effect: {item: 'berserk'}},
            2024: {kind: 'pickup', sprite: 'PINSA0', frames: DoomThingCatalog.animFrames('PINS', 'ABCD'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {item: 'invisibility'}},
            2025: {kind: 'pickup', sprite: 'SUITA0', effect: {item: 'radiationSuit'}},
            2026: {kind: 'pickup', sprite: 'PMAPA0', frames: DoomThingCatalog.animFrames('PMAP', 'ABCD'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {item: 'computerMap'}},
            2045: {kind: 'pickup', sprite: 'PVISA0', frames: DoomThingCatalog.animFrames('PVIS', 'AB'), animDuration: 6 * WadConstants.SECONDS_PER_TIC, effect: {item: 'lightVisor'}},
            // --- Keys (blink between two frames) ---
            5:    {kind: 'pickup', sprite: 'BKEYA0', frames: DoomThingCatalog.animFrames('BKEY', 'AB'), animDuration: 7 * WadConstants.SECONDS_PER_TIC, effect: {item: 'blueKey'}},
            13:   {kind: 'pickup', sprite: 'RKEYA0', frames: DoomThingCatalog.animFrames('RKEY', 'AB'), animDuration: 7 * WadConstants.SECONDS_PER_TIC, effect: {item: 'redKey'}},
            6:    {kind: 'pickup', sprite: 'YKEYA0', frames: DoomThingCatalog.animFrames('YKEY', 'AB'), animDuration: 7 * WadConstants.SECONDS_PER_TIC, effect: {item: 'yellowKey'}},
            40:   {kind: 'pickup', sprite: 'BSKUA0', frames: DoomThingCatalog.animFrames('BSKU', 'AB'), animDuration: 7 * WadConstants.SECONDS_PER_TIC, effect: {item: 'blueKey'}},
            38:   {kind: 'pickup', sprite: 'RSKUA0', frames: DoomThingCatalog.animFrames('RSKU', 'AB'), animDuration: 7 * WadConstants.SECONDS_PER_TIC, effect: {item: 'redKey'}},
            39:   {kind: 'pickup', sprite: 'YSKUA0', frames: DoomThingCatalog.animFrames('YSKU', 'AB'), animDuration: 7 * WadConstants.SECONDS_PER_TIC, effect: {item: 'yellowKey'}},
            // --- Static floor decorations ---
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
            36:   {kind: 'decoration', code: 'pillarHeart',     frames: DoomThingCatalog.animFrames('COL5', 'AB'),    animDuration: 10 * WadConstants.SECONDS_PER_TIC},
            41:   {kind: 'decoration', code: 'evilEye',         frames: DoomThingCatalog.animFrames('CEYE', 'ABCB'),  animDuration: 6 * WadConstants.SECONDS_PER_TIC},
            42:   {kind: 'decoration', code: 'floatSkull',      frames: DoomThingCatalog.animFrames('FSKU', 'ABC'),   animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            26:   {kind: 'decoration', code: 'twitchImpaled',   frames: DoomThingCatalog.animFrames('POL6', 'AB'),    animDuration: 7 * WadConstants.SECONDS_PER_TIC},
            29:   {kind: 'decoration', code: 'skullPile',       frames: DoomThingCatalog.animFrames('POL3', 'AB'),    animDuration: 7 * WadConstants.SECONDS_PER_TIC},
            70:   {kind: 'decoration', code: 'burningBarrel',   frames: DoomThingCatalog.animFrames('FCAN', 'ABC'),   animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            44:   {kind: 'decoration', code: 'tallBlueTorch',   frames: DoomThingCatalog.animFrames('TBLU', 'ABCD'),  animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            45:   {kind: 'decoration', code: 'tallGreenTorch',  frames: DoomThingCatalog.animFrames('TGRN', 'ABCD'),  animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            46:   {kind: 'decoration', code: 'tallRedTorch',    frames: DoomThingCatalog.animFrames('TRED', 'ABCD'),  animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            55:   {kind: 'decoration', code: 'shortBlueTorch',  frames: DoomThingCatalog.animFrames('SMBT', 'ABCD'),  animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            56:   {kind: 'decoration', code: 'shortGreenTorch', frames: DoomThingCatalog.animFrames('SMGT', 'ABCD'),  animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            57:   {kind: 'decoration', code: 'shortRedTorch',   frames: DoomThingCatalog.animFrames('SMRT', 'ABCD'),  animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            85:   {kind: 'decoration', code: 'tallTechLamp',    frames: DoomThingCatalog.animFrames('TLMP', 'ABCD'),  animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            86:   {kind: 'decoration', code: 'shortTechLamp',   frames: DoomThingCatalog.animFrames('TLP2', 'ABCD'),  animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            // --- Ceiling-hung decorations (solid set per type) ---
            49:   {kind: 'decoration', code: 'hangTwitching', solid: true,  frames: DoomThingCatalog.animFrames('GOR1', 'ABC'), animDuration: 7 * WadConstants.SECONDS_PER_TIC},
            63:   {kind: 'decoration', code: 'hangTwitching', solid: false, frames: DoomThingCatalog.animFrames('GOR1', 'ABC'), animDuration: 7 * WadConstants.SECONDS_PER_TIC},
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

    // Shared state blocks of the variant families (the spectre is a demon,
    // the hell knight is a baron): one transcription each.
    _demonStates() {
        return {
            spawn: [['AB', 10, 'A_Look', 'spawn']],
            see:   [['AABBCCDD', 2, 'A_Chase', 'see', false, true]],
            melee: [['EF', 8, 'A_FaceTarget', null, false, true], ['G', 8, 'A_SargAttack', 'see', false, true]],
            pain:  [['H', 2, null, null, false, true], ['H', 2, 'A_Pain', 'see', false, true]],
            death: [['I', 8], ['J', 8, 'A_Scream'], ['K', 4], ['L', 4, 'A_NoBlocking'], ['M', 4], ['N', -1]],
            raise: [['N', 5], ['MLKJI', 5, null, 'see']]
        };
    }

    _bruiserStates(withBossDeath) {
        return {
            spawn:   [['AB', 10, 'A_Look', 'spawn']],
            see:     [['AABBCCDD', 3, 'A_Chase', 'see']],
            missile: [['EF', 8, 'A_FaceTarget'], ['G', 8, 'A_BruisAttack', 'see']],
            pain:    [['H', 2], ['H', 2, 'A_Pain', 'see']],
            death:   [['I', 8], ['J', 8, 'A_Scream'], ['K', 8], ['L', 8, 'A_NoBlocking'], ['MN', 8], ['O', -1, ((withBossDeath) ? 'A_BossDeath' : null)]],
            raise:   [['O', 8], ['NMLKJI', 8, null, 'see']]
        };
    }

    // The Doom bestiary, transcribed state-for-state from the UZDoom zscript
    // actors (zscript/actors/doom/*.zs) with the editor numbers of
    // mapinfo/doomitems.txt. Radius/height in Doom units (converted by the
    // consumers). BossTarget 87 / BossEye 89 are Icon-of-Sin plumbing (no
    // body, handled by the boss machinery), Stealth* and ScriptedMarine are
    // ZDoom additions: none of those are spawnable monsters here.
    monsterDefs() {
        return {
            3004: new DoomMonsterDef({
                code: 'zombieman', name: 'Zombieman', sprite: 'POSS',
                health: 20, radius: 20, height: 56, speed: 8, painChance: 200,
                dropItems: [{item: 'Clip'}],
                states: {
                    spawn:   [['AB', 10, 'A_Look', 'spawn']],
                    see:     [['AABBCCDD', 4, 'A_Chase', 'see']],
                    missile: [['E', 10, 'A_FaceTarget'], ['F', 8, 'A_PosAttack'], ['E', 8, null, 'see']],
                    pain:    [['G', 3], ['G', 3, 'A_Pain', 'see']],
                    death:   [['H', 5], ['I', 5, 'A_Scream'], ['J', 5, 'A_NoBlocking'], ['K', 5], ['L', -1]],
                    xdeath:  [['M', 5], ['N', 5, 'A_XScream'], ['O', 5, 'A_NoBlocking'], ['PQRST', 5], ['U', -1]],
                    raise:   [['K', 5], ['JIH', 5, null, 'see']]
                }
            }),
            9: new DoomMonsterDef({
                code: 'shotgunguy', name: 'Shotgun Guy', sprite: 'SPOS',
                health: 30, radius: 20, height: 56, speed: 8, painChance: 170,
                dropItems: [{item: 'Shotgun'}],
                states: {
                    spawn:   [['AB', 10, 'A_Look', 'spawn']],
                    see:     [['AABBCCDD', 3, 'A_Chase', 'see']],
                    missile: [['E', 10, 'A_FaceTarget'], ['F', 10, 'A_SposAttackUseAtkSound', null, true], ['E', 10, null, 'see']],
                    pain:    [['G', 3], ['G', 3, 'A_Pain', 'see']],
                    death:   [['H', 5], ['I', 5, 'A_Scream'], ['J', 5, 'A_NoBlocking'], ['K', 5], ['L', -1]],
                    xdeath:  [['M', 5], ['N', 5, 'A_XScream'], ['O', 5, 'A_NoBlocking'], ['PQRST', 5], ['U', -1]],
                    raise:   [['L', 5], ['KJIH', 5, null, 'see']]
                }
            }),
            65: new DoomMonsterDef({
                code: 'chaingunguy', name: 'Chaingunner', sprite: 'CPOS',
                health: 70, radius: 20, height: 56, speed: 8, painChance: 170,
                dropItems: [{item: 'Chaingun'}],
                states: {
                    spawn:   [['AB', 10, 'A_Look', 'spawn']],
                    see:     [['AABBCCDD', 3, 'A_Chase', 'see']],
                    missile: [['E', 10, 'A_FaceTarget'], ['FE', 4, 'A_CPosAttack', null, true], ['F', 1, 'A_CPosRefire', 'missile1']],
                    pain:    [['G', 3], ['G', 3, 'A_Pain', 'see']],
                    death:   [['H', 5], ['I', 5, 'A_Scream'], ['J', 5, 'A_NoBlocking'], ['KLM', 5], ['N', -1]],
                    xdeath:  [['O', 5], ['P', 5, 'A_XScream'], ['Q', 5, 'A_NoBlocking'], ['RS', 5], ['T', -1]],
                    raise:   [['N', 5], ['MLKJIH', 5, null, 'see']]
                }
            }),
            84: new DoomMonsterDef({
                code: 'wolfss', name: 'Wolfenstein SS', sprite: 'SSWV',
                health: 50, radius: 20, height: 56, speed: 8, painChance: 170,
                dropItems: [{item: 'Clip'}],
                states: {
                    spawn:   [['AB', 10, 'A_Look', 'spawn']],
                    see:     [['AABBCCDD', 3, 'A_Chase', 'see']],
                    missile: [['E', 10, 'A_FaceTarget'], ['F', 10, 'A_FaceTarget'], ['G', 4, 'A_CPosAttack', null, true], ['F', 6, 'A_FaceTarget'], ['G', 4, 'A_CPosAttack', null, true], ['F', 1, 'A_CPosRefire', 'missile1']],
                    pain:    [['H', 3], ['H', 3, 'A_Pain', 'see']],
                    death:   [['I', 5], ['J', 5, 'A_Scream'], ['K', 5, 'A_NoBlocking'], ['L', 5], ['M', -1]],
                    xdeath:  [['N', 5], ['O', 5, 'A_XScream'], ['P', 5, 'A_NoBlocking'], ['QRSTU', 5], ['V', -1]],
                    raise:   [['M', 5], ['LKJI', 5, null, 'see']]
                }
            }),
            3001: new DoomMonsterDef({
                code: 'imp', name: 'Imp', sprite: 'TROO',
                health: 60, radius: 20, height: 56, speed: 8, painChance: 200,
                states: {
                    // zscript labels Melee+Missile on the same block
                    // (A_TroopAttack picks claw or fireball by range).
                    spawn:   [['AB', 10, 'A_Look', 'spawn']],
                    see:     [['AABBCCDD', 3, 'A_Chase', 'see']],
                    missile: [['EF', 8, 'A_FaceTarget'], ['G', 6, 'A_TroopAttack', 'see']],
                    pain:    [['H', 2], ['H', 2, 'A_Pain', 'see']],
                    death:   [['I', 8], ['J', 8, 'A_Scream'], ['K', 6], ['L', 6, 'A_NoBlocking'], ['M', -1]],
                    xdeath:  [['N', 5], ['O', 5, 'A_XScream'], ['P', 5], ['Q', 5, 'A_NoBlocking'], ['RST', 5], ['U', -1]],
                    raise:   [['ML', 8], ['KJI', 6, null, 'see']]
                }
            }),
            3002: new DoomMonsterDef({
                code: 'demon', name: 'Demon', sprite: 'SARG',
                health: 150, radius: 30, height: 56, mass: 400, speed: 10, painChance: 180,
                states: this._demonStates()
            }),
            58: new DoomMonsterDef({
                // Demon data + translucency: zscript Spectre = RenderStyle
                // OptFuzzy / Alpha 0.5; we render it as a 0.3-alpha shadow
                // (user decision, no software fuzz effect).
                code: 'spectre', name: 'Spectre', sprite: 'SARG', alpha: 0.3,
                health: 150, radius: 30, height: 56, mass: 400, speed: 10, painChance: 180,
                flags: {shadow: true},
                states: this._demonStates()
            }),
            3006: new DoomMonsterDef({
                code: 'lostsoul', name: 'Lost Soul', sprite: 'SKUL',
                health: 100, radius: 16, height: 56, mass: 50, speed: 8, painChance: 256,
                flags: {float: true},
                params: {missileChanceMult: 0.5, damage: 3},
                states: {
                    spawn:   [['AB', 10, 'A_Look', 'spawn', true]],
                    see:     [['AB', 6, 'A_Chase', 'see', true]],
                    missile: [['C', 10, 'A_FaceTarget', null, true], ['D', 4, 'A_SkullAttack', null, true], ['CD', 4, null, 'missile2', true]],
                    pain:    [['E', 3, null, null, true], ['E', 3, 'A_Pain', 'see', true]],
                    // No corpse: the death sequence ends without a -1 state.
                    death:   [['F', 6, null, null, true], ['G', 6, 'A_Scream', null, true], ['H', 6, null, null, true], ['I', 6, 'A_NoBlocking', null, true], ['J', 6], ['K', 6]]
                }
            }),
            3005: new DoomMonsterDef({
                code: 'cacodemon', name: 'Cacodemon', sprite: 'HEAD',
                health: 400, radius: 31, height: 56, mass: 400, speed: 8, painChance: 128,
                flags: {float: true},
                states: {
                    spawn:   [['A', 10, 'A_Look', 'spawn']],
                    see:     [['A', 3, 'A_Chase', 'see']],
                    missile: [['B', 5, 'A_FaceTarget'], ['C', 5, 'A_FaceTarget'], ['D', 5, 'A_HeadAttack', 'see', true]],
                    pain:    [['E', 3], ['E', 3, 'A_Pain'], ['F', 6, null, 'see']],
                    death:   [['G', 8], ['H', 8, 'A_Scream'], ['I', 8], ['J', 8], ['K', 8, 'A_NoBlocking'], ['L', -1, 'A_SetFloorClip']],
                    raise:   [['L', 8, 'A_UnSetFloorClip'], ['KJIHG', 8, null, 'see']]
                }
            }),
            69: new DoomMonsterDef({
                code: 'hellknight', name: 'Hell Knight', sprite: 'BOS2',
                health: 500, radius: 24, height: 64, mass: 1000, speed: 8, painChance: 50,
                states: this._bruiserStates(false)
            }),
            3003: new DoomMonsterDef({
                code: 'baron', name: 'Baron of Hell', sprite: 'BOSS',
                health: 1000, radius: 24, height: 64, mass: 1000, speed: 8, painChance: 50,
                bossMaps: ['E1M8'],
                states: this._bruiserStates(true)
            }),
            66: new DoomMonsterDef({
                code: 'revenant', name: 'Revenant', sprite: 'SKEL',
                health: 300, radius: 20, height: 56, mass: 500, speed: 10, painChance: 100,
                params: {meleeThreshold: 196, missileChanceMult: 0.5},
                states: {
                    spawn:   [['AB', 10, 'A_Look', 'spawn']],
                    see:     [['AABBCCDDEEFF', 2, 'A_Chase', 'see']],
                    melee:   [['G', 0, 'A_FaceTarget'], ['G', 6, 'A_SkelWhoosh'], ['H', 6, 'A_FaceTarget'], ['I', 6, 'A_SkelFist', 'see']],
                    missile: [['J', 0, 'A_FaceTarget', null, true], ['J', 10, 'A_FaceTarget', null, true], ['K', 10, 'A_SkelMissile'], ['K', 10, 'A_FaceTarget', 'see']],
                    pain:    [['L', 5], ['L', 5, 'A_Pain', 'see']],
                    death:   [['LM', 7], ['N', 7, 'A_Scream'], ['O', 7, 'A_NoBlocking'], ['P', 7], ['Q', -1]],
                    raise:   [['Q', 5], ['PONML', 5, null, 'see']]
                }
            }),
            67: new DoomMonsterDef({
                code: 'mancubus', name: 'Mancubus', sprite: 'FATT',
                health: 600, radius: 48, height: 64, mass: 1000, speed: 8, painChance: 80,
                bossMaps: ['MAP07-1'],
                states: {
                    spawn:   [['AB', 15, 'A_Look', 'spawn']],
                    see:     [['AABBCCDDEEFF', 4, 'A_Chase', 'see']],
                    missile: [['G', 20, 'A_FatRaise'], ['H', 10, 'A_FatAttack1', null, true], ['IG', 5, 'A_FaceTarget'], ['H', 10, 'A_FatAttack2', null, true], ['IG', 5, 'A_FaceTarget'], ['H', 10, 'A_FatAttack3', null, true], ['IG', 5, 'A_FaceTarget', 'see']],
                    pain:    [['J', 3], ['J', 3, 'A_Pain', 'see']],
                    death:   [['K', 6], ['L', 6, 'A_Scream'], ['M', 6, 'A_NoBlocking'], ['NOPQRS', 6], ['T', -1, 'A_BossDeath']],
                    raise:   [['R', 5], ['QPONMLK', 5, null, 'see']]
                }
            }),
            68: new DoomMonsterDef({
                code: 'arachnotron', name: 'Arachnotron', sprite: 'BSPI',
                health: 500, radius: 64, height: 64, mass: 600, speed: 12, painChance: 128,
                bossMaps: ['MAP07-2'],
                states: {
                    spawn:   [['AB', 10, 'A_Look', 'spawn']],
                    see:     [['A', 20], ['A', 3, 'A_BabyMetal'], ['ABBCC', 3, 'A_Chase'], ['D', 3, 'A_BabyMetal'], ['DEEFF', 3, 'A_Chase', 'see1']],
                    missile: [['A', 20, 'A_FaceTarget', null, true], ['G', 4, 'A_BspiAttack', null, true], ['H', 4, null, null, true], ['H', 1, 'A_SpidRefire', 'missile1', true]],
                    pain:    [['I', 3], ['I', 3, 'A_Pain', 'see1']],
                    death:   [['J', 20, 'A_Scream'], ['K', 7, 'A_NoBlocking'], ['LMNO', 7], ['P', -1, 'A_BossDeath']],
                    raise:   [['P', 5], ['ONMLKJ', 5, null, 'see1']]
                }
            }),
            71: new DoomMonsterDef({
                code: 'painelemental', name: 'Pain Elemental', sprite: 'PAIN',
                health: 400, radius: 31, height: 56, mass: 400, speed: 8, painChance: 128,
                flags: {float: true},
                states: {
                    spawn:   [['A', 10, 'A_Look', 'spawn']],
                    see:     [['AABBCC', 3, 'A_Chase', 'see']],
                    missile: [['D', 5, 'A_FaceTarget'], ['E', 5, 'A_FaceTarget'], ['F', 5, 'A_FaceTarget', null, true], ['F', 0, 'A_PainAttack', 'see', true]],
                    pain:    [['G', 6], ['G', 6, 'A_Pain', 'see']],
                    // A_PainDie bursts into lost souls: no corpse.
                    death:   [['H', 8, null, null, true], ['I', 8, 'A_Scream', null, true], ['JK', 8, null, null, true], ['L', 8, 'A_PainDie', null, true], ['M', 8, null, null, true]],
                    raise:   [['MLKJIH', 8, null, 'see']]
                }
            }),
            64: new DoomMonsterDef({
                code: 'archvile', name: 'Archvile', sprite: 'VILE',
                health: 700, radius: 20, height: 56, mass: 500, speed: 15, painChance: 10,
                flags: {noTarget: true},
                params: {maxTargetRange: 896},
                states: {
                    spawn:   [['AB', 10, 'A_Look', 'spawn']],
                    see:     [['AABBCCDDEEFF', 2, 'A_VileChase', 'see']],
                    missile: [['G', 0, 'A_VileStart', null, true], ['G', 10, 'A_FaceTarget', null, true], ['H', 8, 'A_VileTarget', null, true], ['IJKLMN', 8, 'A_FaceTarget', null, true], ['O', 8, 'A_VileAttack', null, true], ['P', 20, null, 'see', true]],
                    heal:    [['[\\]', 10, null, 'see', true]],
                    pain:    [['Q', 5], ['Q', 5, 'A_Pain', 'see']],
                    death:   [['Q', 7], ['R', 7, 'A_Scream'], ['S', 7, 'A_NoBlocking'], ['TUVWXY', 7], ['Z', -1]]
                }
            }),
            7: new DoomMonsterDef({
                code: 'mastermind', name: 'Spider Mastermind', sprite: 'SPID',
                health: 3000, radius: 128, height: 100, mass: 1000, speed: 12, painChance: 40,
                flags: {boss: true, noRadiusDmg: true},
                bossMaps: ['E3M8', 'E4M8'],
                params: {missileChanceMult: 0.5},
                states: {
                    spawn:   [['AB', 10, 'A_Look', 'spawn']],
                    see:     [['A', 3, 'A_Metal'], ['ABB', 3, 'A_Chase'], ['C', 3, 'A_Metal'], ['CDD', 3, 'A_Chase'], ['E', 3, 'A_Metal'], ['EFF', 3, 'A_Chase', 'see']],
                    missile: [['A', 20, 'A_FaceTarget', null, true], ['G', 4, 'A_SPosAttackUseAtkSound', null, true], ['H', 4, 'A_SposAttackUseAtkSound', null, true], ['H', 1, 'A_SpidRefire', 'missile1', true]],
                    pain:    [['I', 3], ['I', 3, 'A_Pain', 'see']],
                    death:   [['J', 20, 'A_Scream'], ['K', 10, 'A_NoBlocking'], ['LMNOPQR', 10], ['S', 30], ['S', -1, 'A_BossDeath']]
                }
            }),
            16: new DoomMonsterDef({
                code: 'cyberdemon', name: 'Cyberdemon', sprite: 'CYBR',
                health: 4000, radius: 40, height: 110, mass: 1000, speed: 16, painChance: 20,
                flags: {boss: true, noRadiusDmg: true},
                bossMaps: ['E2M8', 'E4M6'],
                params: {minMissileChance: 160, missileChanceMult: 0.5},
                states: {
                    spawn:   [['AB', 10, 'A_Look', 'spawn']],
                    see:     [['A', 3, 'A_Hoof'], ['ABBCC', 3, 'A_Chase'], ['D', 3, 'A_Metal'], ['D', 3, 'A_Chase', 'see']],
                    missile: [['E', 6, 'A_FaceTarget'], ['F', 12, 'A_CyberAttack'], ['E', 12, 'A_FaceTarget'], ['F', 12, 'A_CyberAttack'], ['E', 12, 'A_FaceTarget'], ['F', 12, 'A_CyberAttack', 'see']],
                    pain:    [['G', 10, 'A_Pain', 'see']],
                    death:   [['H', 10], ['I', 10, 'A_Scream'], ['JKL', 10], ['M', 10, 'A_NoBlocking'], ['NO', 10], ['P', 30], ['P', -1, 'A_BossDeath']]
                }
            }),
            72: new DoomMonsterDef({
                code: 'keen', name: 'Commander Keen', sprite: 'KEEN',
                health: 100, radius: 16, height: 72, mass: 10000000, speed: 0, painChance: 256,
                ceiling: true,
                states: {
                    spawn: [['A', -1]],
                    pain:  [['M', 4], ['M', 8, 'A_Pain', 'spawn']],
                    death: [['AB', 6], ['C', 6, 'A_Scream'], ['DEFGH', 6], ['I', 6], ['J', 6], ['K', 6, 'A_KeenDie'], ['L', -1]]
                }
            }),
            2035: new DoomMonsterDef({
                // doommisc.zs ExplosiveBarrel: a shootable body, not a kill —
                // its death runs A_Explode (128/128) and the empty end of the
                // sequence despawns it (no respawn).
                code: 'barrel', name: 'Barrel', sprite: 'BAR1',
                health: 20, radius: 10, height: 42, speed: 0, painChance: 0,
                flags: {countsKill: false, noBlood: true, dontGib: true, alwaysSpawn: true, noTarget: true, noCorpseThrust: true},
                params: {explode: {damage: 128, distance: 128}},
                spriteOverrides: {death: 'BEXP'},
                states: {
                    spawn: [['AB', 6, null, 'spawn']],
                    death: [['A', 5, null, null, true], ['B', 5, 'A_Scream', null, true], ['C', 5, null, null, true], ['D', 10, 'A_Explode', null, true], ['E', 10, null, null, true]]
                }
            }),
            88: new DoomMonsterDef({
                code: 'bossbrain', name: 'Boss Brain', sprite: 'BBRN',
                health: 250, radius: 16, height: 16, mass: 10000000, speed: 0, painChance: 255,
                flags: {countsKill: false, dontGib: true},
                states: {
                    spawn: [['A', -1]],
                    pain:  [['B', 36, 'A_BrainPain', 'spawn']],
                    death: [['A', 100, 'A_BrainScream'], ['AA', 10], ['A', -1, 'A_BrainDie']]
                }
            })
        };
    }

    // What the Doom zombies leave behind (zscript DropItem): the dropped clip
    // carries HALF the pickup amount (vanilla MF_DROPPED), dropped weapons
    // flag their halved ammo through effect.dropped.
    dropItemTypes() {
        return {
            Clip:     {sprite: 'CLIPA0', effect: {ammo: 'bullets', amount: 5}},
            Shotgun:  {sprite: 'SHOTA0', effect: {weapon: 'shotgun', dropped: true}},
            Chaingun: {sprite: 'MGUNA0', effect: {weapon: 'chaingun', dropped: true}}
        };
    }

    // Doom skill blocks (UZDoom mapinfo/doomcommon.txt): baby = ammo ×2,
    // damage ×0.5, easy boss brain; nightmare = ammo ×2, fast monsters,
    // instant reaction, 12 s respawn. Skill 0 = skill 1 without monsters.
    skillRules() {
        return {
            0: {spawnFilterBit: 0x01, ammoFactor: 2, damageFactor: 0.5, monstersEnabled: false, fastMonsters: false, instantReaction: false, respawnTicsDelay: 0,       easyBossBrain: true},
            1: {spawnFilterBit: 0x01, ammoFactor: 2, damageFactor: 0.5, monstersEnabled: true,  fastMonsters: false, instantReaction: false, respawnTicsDelay: 0,       easyBossBrain: true},
            2: {spawnFilterBit: 0x01, ammoFactor: 1, damageFactor: 1,   monstersEnabled: true,  fastMonsters: false, instantReaction: false, respawnTicsDelay: 0,       easyBossBrain: true},
            3: {spawnFilterBit: 0x02, ammoFactor: 1, damageFactor: 1,   monstersEnabled: true,  fastMonsters: false, instantReaction: false, respawnTicsDelay: 0,       easyBossBrain: false},
            4: {spawnFilterBit: 0x04, ammoFactor: 1, damageFactor: 1,   monstersEnabled: true,  fastMonsters: false, instantReaction: false, respawnTicsDelay: 0,       easyBossBrain: false},
            5: {spawnFilterBit: 0x04, ammoFactor: 2, damageFactor: 1,   monstersEnabled: true,  fastMonsters: true,  instantReaction: true,  respawnTicsDelay: 12 * 35, easyBossBrain: false}
        };
    }

    // Shared immutable definitions (the per-player state lives on DoomUser).
    buildAmmoTypes() {
        return {
            bullets: new DoomAmmo({code: 'bullets', name: 'Bullets', maxNormal: 200, maxPack: 400, clip: 10}),
            shells:  new DoomAmmo({code: 'shells',  name: 'Shells',  maxNormal: 50,  maxPack: 100, clip: 4}),
            rockets: new DoomAmmo({code: 'rockets', name: 'Rockets', maxNormal: 50,  maxPack: 100, clip: 1}),
            cells:   new DoomAmmo({code: 'cells',   name: 'Cells',   maxNormal: 300, maxPack: 600, clip: 20})
        };
    }

    // The 9 Doom weapons in canonical loadout order, ported state-for-state
    // from d_items.c / info.c / p_pspr.c. Ranges are in world units (Doom
    // units / 64: MELEERANGE 64 → 1, MISSILERANGE 2048 → 32). Spreads are
    // degrees per DoomRandom difference unit (horizontal <<18 / <<19, the SSG
    // vertical slope <<5 turned into a pitch angle).
    buildWeapons() {
        const MELEE = 1.0, HITSCAN = 32.0;
        const SPREAD = 360 / 16384;
        const SSG_H  = 360 / 8192;
        const SSG_V  = (180 / Math.PI) / 2048;
        const READY  = { ready: 'ready', down: 'down', up: 'up', atk: 'fire1', flash: 'flash1' };

        const data = [
            {
                code: 'fist', name: 'Fist', ammoType: null, ammoUse: 0,
                pellets: 1, spreadH: SPREAD, range: MELEE,
                damage: {base: 2, dice: 10}, berserkItem: 'berserk', berserkFactor: 10,
                puffType: 'puff', decalType: 'bulletChip',
                viewSprite: 'PUNG', entry: { ready: 'ready', down: 'down', up: 'up', atk: 'fire1' },
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['B', 4, null, 'fire2'], fire2: ['C', 4, 'fireMelee', 'fire3'], fire3: ['D', 5, null, 'fire4'],
                    fire4: ['C', 4, null, 'fire5'], fire5: ['B', 5, 'refire', 'ready'],
                },
            },
            {
                code: 'chainsaw', name: 'Chainsaw', ammoType: null, ammoUse: 0,
                pellets: 1, spreadH: SPREAD, range: MELEE,
                damage: {base: 2, dice: 10}, kickback: 0,
                puffType: 'puff', decalType: 'bulletChip',
                viewSprite: 'SAWG', entry: { ready: 'ready', down: 'down', up: 'up', atk: 'fire1' },
                main: {
                    ready: ['C', 4, 'ready', 'readyB'], readyB: ['D', 4, 'ready', 'ready'],
                    down: ['C', 1, 'lower', 'down'], up: ['C', 1, 'raise', 'up'],
                    fire1: ['A', 4, 'fireMelee', 'fire2'], fire2: ['B', 4, 'fireMelee', 'fire3'], fire3: ['B', 0, 'refire', 'ready'],
                },
            },
            {
                code: 'pistol', name: 'Pistol', ammoType: 'bullets', ammoUse: 1,
                pellets: 1, spreadH: SPREAD, range: HITSCAN, accurateFirst: true,
                damage: {base: 5, dice: 3},
                puffType: 'puff', decalType: 'bulletChip',
                viewSprite: 'PISG', flashSprite: 'PISF', entry: READY,
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['A', 4, null, 'fire2'], fire2: ['B', 6, 'fireHitscan', 'fire3'],
                    fire3: ['C', 4, null, 'fire4'], fire4: ['B', 5, 'refire', 'ready'],
                },
                flash: { flash1: ['A', 7, 'light1', null] },
            },
            {
                code: 'shotgun', name: 'Shotgun', ammoType: 'shells', ammoUse: 1,
                pellets: 7, spreadH: SPREAD, range: HITSCAN,
                damage: {base: 5, dice: 3},
                puffType: 'puff', decalType: 'bulletChip',
                viewSprite: 'SHTG', flashSprite: 'SHTF', entry: READY,
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['A', 3, null, 'fire2'], fire2: ['A', 7, 'fireHitscan', 'fire3'], fire3: ['B', 5, null, 'fire4'],
                    fire4: ['C', 5, null, 'fire5'], fire5: ['D', 4, null, 'fire6'], fire6: ['C', 5, null, 'fire7'],
                    fire7: ['B', 5, null, 'fire8'], fire8: ['A', 3, null, 'fire9'], fire9: ['A', 7, 'refire', 'ready'],
                },
                flash: { flash1: ['A', 4, 'light1', 'flash2'], flash2: ['B', 3, 'light2', null] },
            },
            {
                code: 'supershotgun', name: 'Super Shotgun', ammoType: 'shells', ammoUse: 2,
                pellets: 20, spreadH: SSG_H, spreadV: SSG_V, range: HITSCAN,
                damage: {base: 5, dice: 3},
                puffType: 'puff', decalType: 'bulletChip',
                viewSprite: 'SHT2', flashSprite: 'SHT2', entry: READY,
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['A', 3, null, 'fire2'], fire2: ['A', 7, 'fireHitscan', 'fire3'], fire3: ['B', 7, null, 'fire4'],
                    fire4: ['C', 7, 'checkReload', 'fire5'], fire5: ['D', 7, 'openShotgun2', 'fire6'], fire6: ['E', 7, null, 'fire7'],
                    fire7: ['F', 7, 'loadShotgun2', 'fire8'], fire8: ['G', 6, null, 'fire9'], fire9: ['H', 6, 'closeShotgun2', 'fire10'],
                    fire10: ['A', 5, 'refire', 'ready'],
                },
                flash: { flash1: ['I', 5, 'light1', 'flash2'], flash2: ['J', 4, 'light2', null] },
            },
            {
                code: 'chaingun', name: 'Chaingun', ammoType: 'bullets', ammoUse: 1,
                pellets: 1, spreadH: SPREAD, range: HITSCAN, accurateFirst: true,
                damage: {base: 5, dice: 3},
                puffType: 'puff', decalType: 'bulletChip',
                viewSprite: 'CHGG', flashSprite: 'CHGF', entry: READY,
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['A', 4, 'fireHitscanFlash1', 'fire2'], fire2: ['B', 4, 'fireHitscanFlash2', 'fire3'], fire3: ['B', 0, 'refire', 'ready'],
                },
                flash: { flash1: ['A', 5, 'light1', null], flash2: ['B', 5, 'light2', null] },
            },
            {
                code: 'rocket', name: 'Rocket Launcher', ammoType: 'rockets', ammoUse: 1,
                projectiles: [{kind: 'rocket'}], autoFire: false,
                viewSprite: 'MISG', flashSprite: 'MISF', entry: READY,
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['B', 8, 'gunFlash', 'fire2'], fire2: ['B', 12, 'fireProjectiles', 'fire3'], fire3: ['B', 0, 'refire', 'ready'],
                },
                flash: {
                    flash1: ['A', 3, 'light1', 'flash2'], flash2: ['B', 4, null, 'flash3'],
                    flash3: ['C', 4, 'light2', 'flash4'], flash4: ['D', 4, 'light2', null],
                },
            },
            {
                code: 'plasma', name: 'Plasma Rifle', ammoType: 'cells', ammoUse: 1,
                projectiles: [{kind: 'plasma'}],
                viewSprite: 'PLSG', flashSprite: 'PLSF', entry: READY,
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['A', 3, 'fireProjectilesRandFlash', 'fire2'], fire2: ['B', 20, 'refire', 'ready'],
                },
                flash: { flash1: ['A', 4, 'light1', null], flash2: ['B', 4, 'light1', null] },
            },
            {
                code: 'bfg', name: 'BFG9000', ammoType: 'cells', ammoUse: 40,
                projectiles: [{kind: 'bfg'}], autoFire: false,
                viewSprite: 'BFGG', flashSprite: 'BFGF', entry: READY,
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['A', 20, 'bfgSound', 'fire2'], fire2: ['B', 10, 'gunFlash', 'fire3'],
                    fire3: ['B', 10, 'fireProjectiles', 'fire4'], fire4: ['B', 20, 'refire', 'ready'],
                },
                flash: { flash1: ['A', 11, 'light1', 'flash2'], flash2: ['B', 6, 'light2', null] },
            },
        ];

        const catalog = {};
        for (const entry of data) {
            catalog[entry.code] = new DoomWeaponDef(entry);
        }
        return catalog;
    }

    // Transient weapon effects (P_SpawnPuff + the projectile death frames from
    // info.c). alpha/additive follow gzdoom: the rocket blast is opaque smoke,
    // the plasma/BFG blasts glow (RenderStyle "Add", Alpha 0.75), the puff is
    // translucent (0.4 — user setting; gzdoom's BulletPuff is Alpha 0.5,
    // doommisc.zs), floats up 1 map unit/tic and starts a melee hit at frame C
    // (meleeStart 2, no bright spark).
    weaponEffectTemplates() {
        return [
            {name: 'puff',          sprite: 'PUFF', letters: ['A', 'B', 'C', 'D'],           frameTics: [4, 4, 4, 4],       alpha: 0.4,  rise: 1, additive: false, meleeStart: 2},
            {name: 'rocketExplode', sprite: 'MISL', letters: ['B', 'C', 'D'],                frameTics: [8, 6, 4],          alpha: 1,    rise: 0, additive: false},
            {name: 'plasmaExplode', sprite: 'PLSE', letters: ['A', 'B', 'C', 'D', 'E'],      frameTics: [4, 4, 4, 4, 4],    alpha: 0.75, rise: 0, additive: true},
            {name: 'bfgExplode',    sprite: 'BFE1', letters: ['A', 'B', 'C', 'D', 'E', 'F'], frameTics: [8, 8, 8, 8, 8, 8], alpha: 0.75, rise: 0, additive: true},
            {name: 'bfgSprayHit',   sprite: 'BFE2', letters: ['A', 'B', 'C', 'D'],           frameTics: [8, 8, 8, 8],       alpha: 0.75, rise: 0, additive: true},
            // P_SpawnBlood: momz 2 under mobj gravity (1/tic²); big hits show
            // the full splash, weaker ones start deeper in (monsterDamageRules).
            {name: 'blood',         sprite: 'BLUD', letters: ['C', 'B', 'A'],                frameTics: [8, 8, 8],          alpha: 1,    rise: 2, gravity: 1, additive: false}
        ];
    }

    // Per-game damage-pipeline numbers (UZDoom gameinfo blocks + P_SpawnBlood
    // quirks): Doom gibs past 1× spawn health, kicks back at 100, and stamps
    // its blood by damage with shortened first tics.
    monsterDamageRules() {
        return {gibFactor: 1, defKickback: 100, bloodTemplate: 'blood', bloodDamageAdvance: true};
    }

    // The three Doom projectiles (MT_ROCKET / MT_PLASMA / MT_BFG, info.c):
    // speed in map units/tic, splash = the rocket's A_Explode 128. The
    // in-flight alpha follows gzdoom (PlasmaBall/BFGBall: RenderStyle "Add",
    // Alpha 0.75; the rocket is a solid missile).
    // impactDamage = the zscript Damage property: a direct body hit rolls
    // ((rng & 7) + 1) × impactDamage (GetMissileDamage). The BFG ball also
    // fires the vanilla A_BFGSpray from the shooter on detonation.
    projectileDefs() {
        return [
            {kind: 'rocket', sprite: 'MISL', letters: ['A'],      speed: 20, flightTics: 1, explosion: 'rocketExplode', splashDamage: 128, impactDamage: 20,  alpha: 1,    additive: false, decalType: 'scorch'},
            {kind: 'plasma', sprite: 'PLSS', letters: ['A', 'B'], speed: 25, flightTics: 6, explosion: 'plasmaExplode', splashDamage: 0,   impactDamage: 5,   alpha: 0.75, additive: true,  decalType: 'plasma'},
            {kind: 'bfg',    sprite: 'BFS1', letters: ['A', 'B'], speed: 25, flightTics: 4, explosion: 'bfgExplode',    splashDamage: 0,   impactDamage: 100, alpha: 0.75, additive: true,  decalType: 'bfg', spray: {rays: 40, damageCount: 15, angle: 90, distance: 1024, effect: 'bfgSprayHit'}}
        ];
    }

    // Vanilla P_CheckAmmo preference chain; min carries the two explicit
    // thresholds (> 2 shells for the SSG, > 40 cells for the BFG — a generic
    // >= perShot would give 2 and 40, a subtle regression).
    weaponFallbackOrder() {
        return [
            {code: 'plasma'},
            {code: 'supershotgun', min: 3},
            {code: 'chaingun'},
            {code: 'shotgun'},
            {code: 'pistol'},
            {code: 'chainsaw'},
            {code: 'rocket'},
            {code: 'bfg', min: 41},
            {code: 'fist'}
        ];
    }

    // Full-kit cheat armour: the Doom blue armour (200 points, absorbs half).
    cheatKitArmor() {
        return {points: 200, absorb: 0.5};
    }

    buildItems() {
        return {
            redKey:        new DoomItem({code: 'redKey',        name: 'Red Key',         type: 'key'}),
            blueKey:       new DoomItem({code: 'blueKey',       name: 'Blue Key',        type: 'key'}),
            yellowKey:     new DoomItem({code: 'yellowKey',     name: 'Yellow Key',      type: 'key'}),
            berserk:       new DoomItem({code: 'berserk',       name: 'Berserk',         type: 'powerupPermanent', effect: 'berserk', pickupHeal: 100}),
            computerMap:   new DoomItem({code: 'computerMap',   name: 'Computer Map',    type: 'powerupPermanent', effect: 'map'}),
            invulnerability: new DoomItem({code: 'invulnerability', name: 'Invulnerability', type: 'powerupTimed', effect: 'invulnerability', duration: 30000}),
            radiationSuit: new DoomItem({code: 'radiationSuit', name: 'Radiation Suit',  type: 'powerupTimed', effect: 'radiation', duration: 60000}),
            lightVisor:    new DoomItem({code: 'lightVisor',    name: 'Light Visor',     type: 'powerupTimed', effect: 'light', duration: 120000}),
            invisibility:  new DoomItem({code: 'invisibility',  name: 'Invisibility',    type: 'powerupTimed', effect: 'invisibility', duration: 60000})
        };
    }

    // Canonical Doom starting loadout: Fist + Pistol owned (Pistol active),
    // 50 bullets, the fixed 0→200 armour ceiling.
    startingLoadout() {
        return {
            weapons:      ['fist', 'pistol'],
            activeWeapon: 'pistol',
            ammo:         {bullets: 50},
            maxArmor:     200
        };
    }

    // HUD layout data: the ARMS panel slots and the key dot colors adapt to
    // the game through these two tables.
    hudWeaponSlots() {
        return {
            count: 7,
            // Slot 1 (the fist) is always lit; the chainsaw is its upgrade.
            alwaysOwnedSlot: 1,
            upgradeWeapon:   'chainsaw',
            byWeapon: {
                fist:         1,
                chainsaw:     1,
                pistol:       2,
                shotgun:      3,
                supershotgun: 3,
                chaingun:     4,
                rocket:       5,
                plasma:       6,
                bfg:          7
            }
        };
    }

    hudKeyColors() {
        return {blueKey: '#3d7bff', yellowKey: '#ffd23d', redKey: '#ff4444'};
    }

    // Vanilla Doom hardcoded animation sequences (p_spec.c, 8 tics per frame),
    // used when the WAD has no ANIMATED lump.
    vanillaAnimSequences() {
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

    // Doom switch pairing follows the SW1xxx ↔ SW2xxx naming convention (the
    // texture bank's generic prefix substitution) — no explicit pairs needed.
    switchPairs() {
        return [];
    }

    // Vanilla sky texture by level: E<m>M<n> → SKY<m> (m clamped 1..4);
    // MAP<nn> → SKY1 (1-11) / SKY2 (12-20) / SKY3 (21+). Fallback SKY1.
    // Wrap: vanilla repeats the 256-px sky ~4× per 360°.
    skyForLevel(levelName) {
        const wrap = 4;
        const ep = (/^E(\d)M\d/i).exec(levelName);
        if (ep !== null) {
            return {name: 'SKY' + Math.min(4, Math.max(1, parseInt(ep[1], 10))), wrap: wrap};
        }
        const mp = (/^MAP(\d+)/i).exec(levelName);
        if (mp !== null) {
            const n = parseInt(mp[1], 10);
            if (n <= 11) {
                return {name: 'SKY1', wrap: wrap};
            }
            if (n <= 20) {
                return {name: 'SKY2', wrap: wrap};
            }
            return {name: 'SKY3', wrap: wrap};
        }

        return {name: 'SKY1', wrap: wrap};
    }

    // The UZDoom impact-decal graphics (GPL v3, website/assets/uzdoom/).
    decalAssets() {
        return {
            basePath: '/assets/uzdoom/doom/sprite/',
            keys: [
                'chip1', 'chip2', 'chip3', 'chip4', 'chip5',
                'scorch1', 'plasma1', 'plasma2',
                'bfglite1', 'bfglite2', 'bfgscrc1', 'bfgscrc2'
            ]
        };
    }

    // Faithful to UZDoom's decaldef.txt: per-weapon graphic + scale + shade;
    // translucency + a luminance gain lifting the soft burns above the
    // shader's a<0.5 cutout (chips are already crisp). shade 'bfg' resolves
    // to bfgDecalShade() (green id art, bluish freedoom art).
    decalTemplates() {
        return [
            {type: 'bulletChip', keys: ['chip1', 'chip2', 'chip3', 'chip4', 'chip5'], scale: 0.5, shade: [0, 0, 0], translucent: 0.85, gain: 1.0},
            {type: 'scorch',     keys: ['scorch1'],              scale: 0.5, shade: [0, 0, 0], translucent: 1, gain: 1.8},
            {type: 'plasma',     keys: ['plasma1', 'plasma2'],   scale: 0.3, shade: [0, 0, 0], translucent: 1, gain: 2.2},
            {type: 'bfgscrc',    keys: ['bfgscrc1', 'bfgscrc2'], scale: 1.0, shade: [0, 0, 0], translucent: 1, gain: 2.2},
            {type: 'bfglite',    keys: ['bfglite1', 'bfglite2'], scale: 1.0, shade: 'bfg', gain: 1.5, fade: true}
        ];
    }
}
