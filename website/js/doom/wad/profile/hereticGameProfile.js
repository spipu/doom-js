/**
 * Heretic profile. The tables below are transcribed from the UZDoom sources
 * (wadsrc/static/xlat/heretic.txt vs base.txt, defines.i speed units = 1/8
 * Doom unit per tic) — never from memory. Divergent specials are remapped to
 * SYNTHETIC internal codes (>= 1000, unreachable by vanilla WAD data, see
 * WadConstants) so the Doom pipeline stays byte-identical.
 */
class HereticGameProfile extends DefaultGameProfile {
    getCode() {
        return 'heretic';
    }

    /**
     * Heretic-only lumps (GZDoom iwadinfo: MUS_E1M1 music naming, TINTTAB
     * translucency blend table).
     *
     * @param {WadFile} wadFile
     * @returns {boolean}
     */
    matchesWad(wadFile) {
        return ((wadFile.getLump('MUS_E1M1') !== null) || (wadFile.getLump('TINTTAB') !== null));
    }

    /**
     * Same ExMy patterns as the baseline, but the secret ExM9 maps return to
     * different slots (UZDoom mapinfo/heretic.txt next entries). Heretic has
     * no MAPxx maps — the MAP31/32 slots of the baseline stay inert.
     *
     * @returns {object}
     */
    progressionRules() {
        return {
            ...super.progressionRules(),
            episodeSecretReturns: {1: 'E1M7', 2: 'E2M5', 3: 'E3M5', 4: 'E4M5', 5: 'E5M4'}
        };
    }

    // Heretic world things: editor numbers, sprite frames, radii and flags
    // transcribed from the UZDoom sources (mapinfo/heretic.txt DoomEdNums +
    // zscript/actors/heretic/ and actors/raven/) — never from memory.
    // Enemies, starts, ambient-sound things (41/42/1200-1209), generators
    // (43/52/74), BossSpot (56), MaceSpawner (2002) and the Bridge (118)
    // are absent on purpose (silent skip). Inventory artifacts with no
    // transposable effect (egg, time bomb, chaos device, tome, wings) are
    // visible pickups with a null effect: never consumed, they stay.
    thingDecorations() {
        return {
            // Floor obstacles (solid)
            serpentTorch:    new DoomDecoration({code: 'serpentTorch',    name: 'Serpent torch',      sprite: 'SRTCA0', solid: true,  radius: 12 * WadConstants.SCALE}),
            smallPillar:     new DoomDecoration({code: 'smallPillar',     name: 'Small pillar',       sprite: 'SMPLA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            stalagmiteSmall: new DoomDecoration({code: 'stalagmiteSmall', name: 'Small stalagmite',   sprite: 'STGSA0', solid: true,  radius: 8 * WadConstants.SCALE}),
            stalagmiteLarge: new DoomDecoration({code: 'stalagmiteLarge', name: 'Large stalagmite',   sprite: 'STGLA0', solid: true,  radius: 12 * WadConstants.SCALE}),
            fireBrazier:     new DoomDecoration({code: 'fireBrazier',     name: 'Fire brazier',       sprite: 'KFR1A0', solid: true,  radius: 16 * WadConstants.SCALE}),
            barrel:          new DoomDecoration({code: 'barrel',          name: 'Barrel',             sprite: 'BARLA0', solid: true,  radius: 12 * WadConstants.SCALE}),
            brownPillar:     new DoomDecoration({code: 'brownPillar',     name: 'Brown pillar',       sprite: 'BRPLA0', solid: true,  radius: 14 * WadConstants.SCALE}),
            volcano:         new DoomDecoration({code: 'volcano',         name: 'Volcano',            sprite: 'VLCOA0', solid: true,  radius: 12 * WadConstants.SCALE}),
            pod:             new DoomDecoration({code: 'pod',             name: 'Gas pod',            sprite: 'PPODA0', solid: true,  radius: 16 * WadConstants.SCALE}),
            // Key gizmos: solid base pillar (the floating colored top of the
            // vanilla actor pair is not spawned — assumed simplification)
            keyGizmoBlue:    new DoomDecoration({code: 'keyGizmoBlue',    name: 'Blue key gizmo',     sprite: 'KGZ1A0', solid: true,  radius: 16 * WadConstants.SCALE}),
            keyGizmoGreen:   new DoomDecoration({code: 'keyGizmoGreen',   name: 'Green key gizmo',    sprite: 'KGZ1A0', solid: true,  radius: 16 * WadConstants.SCALE}),
            keyGizmoYellow:  new DoomDecoration({code: 'keyGizmoYellow',  name: 'Yellow key gizmo',   sprite: 'KGZ1A0', solid: true,  radius: 16 * WadConstants.SCALE}),
            // Wall torch (+NOGRAVITY, sits against a wall at floor height)
            wallTorch:       new DoomDecoration({code: 'wallTorch',       name: 'Wall torch',         sprite: 'WTRHA0', solid: false, radius: 0}),
            // Ceiling-hung
            skullHang70:     new DoomDecoration({code: 'skullHang70',     name: 'Hanging skull 70',   sprite: 'SKH1A0', solid: false, radius: 20 * WadConstants.SCALE, ceiling: true}),
            skullHang60:     new DoomDecoration({code: 'skullHang60',     name: 'Hanging skull 60',   sprite: 'SKH2A0', solid: false, radius: 20 * WadConstants.SCALE, ceiling: true}),
            skullHang45:     new DoomDecoration({code: 'skullHang45',     name: 'Hanging skull 45',   sprite: 'SKH3A0', solid: false, radius: 20 * WadConstants.SCALE, ceiling: true}),
            skullHang35:     new DoomDecoration({code: 'skullHang35',     name: 'Hanging skull 35',   sprite: 'SKH4A0', solid: false, radius: 20 * WadConstants.SCALE, ceiling: true}),
            chandelier:      new DoomDecoration({code: 'chandelier',      name: 'Chandelier',         sprite: 'CHDLA0', solid: false, radius: 20 * WadConstants.SCALE, ceiling: true}),
            stalactiteSmall: new DoomDecoration({code: 'stalactiteSmall', name: 'Small stalactite',   sprite: 'STCSA0', solid: true,  radius: 8 * WadConstants.SCALE,  ceiling: true}),
            stalactiteLarge: new DoomDecoration({code: 'stalactiteLarge', name: 'Large stalactite',   sprite: 'STCLA0', solid: true,  radius: 12 * WadConstants.SCALE, ceiling: true}),
            moss1:           new DoomDecoration({code: 'moss1',           name: 'Hanging moss 1',     sprite: 'MOS1A0', solid: false, radius: 20 * WadConstants.SCALE, ceiling: true}),
            moss2:           new DoomDecoration({code: 'moss2',           name: 'Hanging moss 2',     sprite: 'MOS2A0', solid: false, radius: 20 * WadConstants.SCALE, ceiling: true}),
            hangingCorpse:   new DoomDecoration({code: 'hangingCorpse',   name: 'Hanging corpse',     sprite: 'HCORA0', solid: true,  radius: 8 * WadConstants.SCALE,  ceiling: true})
        };
    }

    thingTypes() {
        return {
            // --- Weapons (consumable once the Heretic arsenal exists) ---
            // (no gold wand pickup: editor number 9042 is a GZDoom addition
            // whose GWAN sprite is not in the vanilla WAD — starting weapon)
            2001: {kind: 'pickup', sprite: 'WBOWA0', effect: {weapon: 'crossbow'}},
            53:   {kind: 'pickup', sprite: 'WBLSA0', effect: {weapon: 'blaster'}},
            2004: {kind: 'pickup', sprite: 'WSKLA0', effect: {weapon: 'skullrod'}},
            2003: {kind: 'pickup', sprite: 'WPHXA0', effect: {weapon: 'phoenixrod'}},
            2005: {kind: 'pickup', sprite: 'WGNTA0', effect: {weapon: 'gauntlets'}},
            // --- Ammo (small / hefty amounts from the zscript definitions) ---
            10:   {kind: 'pickup', sprite: 'AMG1A0', effect: {ammo: 'crystals', amount: 10}},
            12:   {kind: 'pickup', sprite: 'AMG2A0', frames: DoomThingCatalog.animFrames('AMG2', 'ABC'), animDuration: 4 * WadConstants.SECONDS_PER_TIC, effect: {ammo: 'crystals', amount: 50}},
            18:   {kind: 'pickup', sprite: 'AMC1A0', effect: {ammo: 'arrows', amount: 5}},
            19:   {kind: 'pickup', sprite: 'AMC2A0', frames: DoomThingCatalog.animFrames('AMC2', 'ABC'), animDuration: 5 * WadConstants.SECONDS_PER_TIC, effect: {ammo: 'arrows', amount: 20}},
            13:   {kind: 'pickup', sprite: 'AMM1A0', effect: {ammo: 'spheres', amount: 20}},
            16:   {kind: 'pickup', sprite: 'AMM2A0', effect: {ammo: 'spheres', amount: 100}},
            54:   {kind: 'pickup', sprite: 'AMB1A0', frames: DoomThingCatalog.animFrames('AMB1', 'ABC'), animDuration: 4 * WadConstants.SECONDS_PER_TIC, effect: {ammo: 'orbs', amount: 10}},
            55:   {kind: 'pickup', sprite: 'AMB2A0', frames: DoomThingCatalog.animFrames('AMB2', 'ABC'), animDuration: 4 * WadConstants.SECONDS_PER_TIC, effect: {ammo: 'orbs', amount: 25}},
            20:   {kind: 'pickup', sprite: 'AMS1A0', frames: DoomThingCatalog.animFrames('AMS1', 'AB'), animDuration: 5 * WadConstants.SECONDS_PER_TIC, effect: {ammo: 'runes', amount: 20}},
            21:   {kind: 'pickup', sprite: 'AMS2A0', frames: DoomThingCatalog.animFrames('AMS2', 'AB'), animDuration: 5 * WadConstants.SECONDS_PER_TIC, effect: {ammo: 'runes', amount: 100}},
            22:   {kind: 'pickup', sprite: 'AMP1A0', frames: DoomThingCatalog.animFrames('AMP1', 'ABC'), animDuration: 4 * WadConstants.SECONDS_PER_TIC, effect: {ammo: 'flameorbs', amount: 1}},
            23:   {kind: 'pickup', sprite: 'AMP2A0', frames: DoomThingCatalog.animFrames('AMP2', 'ABC'), animDuration: 4 * WadConstants.SECONDS_PER_TIC, effect: {ammo: 'flameorbs', amount: 10}},
            8:    {kind: 'pickup', sprite: 'BAGHA0', effect: {backpack: true}},
            // --- Health / armor ---
            81:   {kind: 'pickup', sprite: 'PTN1A0', frames: DoomThingCatalog.animFrames('PTN1', 'ABC'), animDuration: 3 * WadConstants.SECONDS_PER_TIC, effect: {health: 10}},
            82:   {kind: 'pickup', sprite: 'PTN2A0', frames: DoomThingCatalog.animFrames('PTN2', 'ABC'), animDuration: 4 * WadConstants.SECONDS_PER_TIC, effect: {health: 25}},
            32:   {kind: 'pickup', sprite: 'SPHLA0', effect: {health: 100}},
            85:   {kind: 'pickup', sprite: 'SHLDA0', effect: {armor: {points: 100, absorb: 0.5}}},
            31:   {kind: 'pickup', sprite: 'SHD2A0', effect: {armor: {points: 200, absorb: 0.75}}},
            // --- Keys ---
            73:   {kind: 'pickup', sprite: 'AKYYA0', frames: DoomThingCatalog.animFrames('AKYY', 'ABCDEFGHIJ'), animDuration: 3 * WadConstants.SECONDS_PER_TIC, effect: {item: 'greenKey'}},
            79:   {kind: 'pickup', sprite: 'BKYYA0', frames: DoomThingCatalog.animFrames('BKYY', 'ABCDEFGHIJ'), animDuration: 3 * WadConstants.SECONDS_PER_TIC, effect: {item: 'blueKey'}},
            80:   {kind: 'pickup', sprite: 'CKYYA0', frames: DoomThingCatalog.animFrames('CKYY', 'ABCDEFGHI'), animDuration: 3 * WadConstants.SECONDS_PER_TIC, effect: {item: 'yellowKey'}},
            // --- Artifacts with a transposable immediate effect ---
            84:   {kind: 'pickup', sprite: 'INVUA0', frames: DoomThingCatalog.animFrames('INVU', 'ABCD'), animDuration: 3 * WadConstants.SECONDS_PER_TIC, effect: {item: 'invulnerability'}},
            75:   {kind: 'pickup', sprite: 'INVSA0', effect: {item: 'invisibility'}},
            33:   {kind: 'pickup', sprite: 'TRCHA0', frames: DoomThingCatalog.animFrames('TRCH', 'ABC'), animDuration: 3 * WadConstants.SECONDS_PER_TIC, effect: {item: 'torch'}},
            35:   {kind: 'pickup', sprite: 'SPMPA0', effect: {item: 'superMap'}},
            // --- Inventory artifacts with no transposable effect: visible,
            // --- never consumed (effect null)
            30:   {kind: 'pickup', sprite: 'EGGCA0', effect: null},
            34:   {kind: 'pickup', sprite: 'FBMBE0', effect: null},
            36:   {kind: 'pickup', sprite: 'ATLPA0', effect: null},
            83:   {kind: 'pickup', sprite: 'SOARA0', effect: null},
            86:   {kind: 'pickup', sprite: 'PWBKA0', effect: null},
            // --- Static floor decorations ---
            29:   {kind: 'decoration', code: 'smallPillar'},
            37:   {kind: 'decoration', code: 'stalagmiteSmall'},
            38:   {kind: 'decoration', code: 'stalagmiteLarge'},
            44:   {kind: 'decoration', code: 'barrel'},
            47:   {kind: 'decoration', code: 'brownPillar'},
            87:   {kind: 'decoration', code: 'volcano'},
            2035: {kind: 'decoration', code: 'pod'},
            94:   {kind: 'decoration', code: 'keyGizmoBlue'},
            95:   {kind: 'decoration', code: 'keyGizmoGreen'},
            96:   {kind: 'decoration', code: 'keyGizmoYellow'},
            // --- Animated floor decorations ---
            27:   {kind: 'decoration', code: 'serpentTorch', frames: DoomThingCatalog.animFrames('SRTC', 'ABC'), animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            76:   {kind: 'decoration', code: 'fireBrazier',  frames: DoomThingCatalog.animFrames('KFR1', 'ABCDEFGH'), animDuration: 3 * WadConstants.SECONDS_PER_TIC},
            50:   {kind: 'decoration', code: 'wallTorch',    frames: DoomThingCatalog.animFrames('WTRH', 'ABC'), animDuration: 6 * WadConstants.SECONDS_PER_TIC},
            // --- Ceiling-hung decorations ---
            17:   {kind: 'decoration', code: 'skullHang70'},
            24:   {kind: 'decoration', code: 'skullHang60'},
            25:   {kind: 'decoration', code: 'skullHang45'},
            26:   {kind: 'decoration', code: 'skullHang35'},
            28:   {kind: 'decoration', code: 'chandelier', frames: DoomThingCatalog.animFrames('CHDL', 'ABC'), animDuration: 4 * WadConstants.SECONDS_PER_TIC},
            39:   {kind: 'decoration', code: 'stalactiteSmall'},
            40:   {kind: 'decoration', code: 'stalactiteLarge'},
            48:   {kind: 'decoration', code: 'moss1'},
            49:   {kind: 'decoration', code: 'moss2'},
            51:   {kind: 'decoration', code: 'hangingCorpse'}
        };
    }

    // Amounts/caps from the UZDoom zscript ammo definitions (hereticammo.zs):
    // clip = small-pickup amount, packGive = what the Bag of Holding grants
    // (mace spheres get none).
    buildAmmoTypes() {
        return {
            crystals:  new DoomAmmo({code: 'crystals',  name: 'Wand Crystals',   maxNormal: 100, maxPack: 200, clip: 10}),
            arrows:    new DoomAmmo({code: 'arrows',    name: 'Ethereal Arrows', maxNormal: 50,  maxPack: 100, clip: 5}),
            orbs:      new DoomAmmo({code: 'orbs',      name: 'Claw Orbs',       maxNormal: 200, maxPack: 400, clip: 10}),
            runes:     new DoomAmmo({code: 'runes',     name: 'Hellstaff Runes', maxNormal: 200, maxPack: 400, clip: 20}),
            flameorbs: new DoomAmmo({code: 'flameorbs', name: 'Flame Orbs',      maxNormal: 20,  maxPack: 40,  clip: 1}),
            spheres:   new DoomAmmo({code: 'spheres',   name: 'Mace Spheres',    maxNormal: 150, maxPack: 300, clip: 20, packGive: 0})
        };
    }

    // The Heretic arsenal (psprite states, firing) is not built yet: weapon
    // pickups stay on the ground until it lands.
    buildWeapons() {
        return {};
    }

    buildItems() {
        return {
            greenKey:  new DoomItem({code: 'greenKey',  name: 'Green Key',  type: 'key'}),
            blueKey:   new DoomItem({code: 'blueKey',   name: 'Blue Key',   type: 'key'}),
            yellowKey: new DoomItem({code: 'yellowKey', name: 'Yellow Key', type: 'key'}),
            superMap:  new DoomItem({code: 'superMap',  name: 'Map Scroll', type: 'powerupPermanent', effect: 'map'}),
            invulnerability: new DoomItem({code: 'invulnerability', name: 'Ring of Invincibility', type: 'powerupTimed', effect: 'invulnerability', duration: 30000}),
            invisibility:    new DoomItem({code: 'invisibility',    name: 'Shadowsphere',          type: 'powerupTimed', effect: 'invisibility', duration: 60000}),
            torch:           new DoomItem({code: 'torch',           name: 'Torch',                 type: 'powerupTimed', effect: 'light', duration: 120000})
        };
    }

    // No weapon yet (see buildWeapons): bare hands until the arsenal lands.
    startingLoadout() {
        return {
            weapons:      [],
            activeWeapon: null,
            ammo:         {},
            maxArmor:     200
        };
    }

    hudWeaponSlots() {
        return {
            count: 7,
            // Slot 1 (the staff) is always lit; the gauntlets are its upgrade.
            alwaysOwnedSlot: 1,
            upgradeWeapon:   'gauntlets',
            byWeapon: {
                staff:      1,
                gauntlets:  1,
                goldwand:   2,
                crossbow:   3,
                blaster:    4,
                skullrod:   5,
                phoenixrod: 6,
                mace:       7
            }
        };
    }

    hudKeyColors() {
        return {blueKey: '#3d7bff', yellowKey: '#ffd23d', greenKey: '#3ddd66'};
    }

    // Heretic hardcoded animation sequences with their engine speeds
    // (UZDoom filter/game-heretic/animated.lmp) — heretic.wad has no
    // ANIMATED lump, these always apply.
    vanillaAnimSequences() {
        const raw = [
            [true,  ['FLTWAWA1', 'FLTWAWA2', 'FLTWAWA3'], 8],
            [true,  ['FLTSLUD1', 'FLTSLUD2', 'FLTSLUD3'], 8],
            [true,  ['FLTTELE1', 'FLTTELE2', 'FLTTELE3', 'FLTTELE4'], 6],
            [true,  ['FLTFLWW1', 'FLTFLWW2', 'FLTFLWW3'], 9],
            [true,  ['FLTLAVA1', 'FLTLAVA2', 'FLTLAVA3', 'FLTLAVA4'], 8],
            [true,  ['FLATHUH1', 'FLATHUH2', 'FLATHUH3', 'FLATHUH4'], 8],
            [false, ['LAVAFL1', 'LAVAFL2', 'LAVAFL3'], 6],
            [false, ['WATRWAL1', 'WATRWAL2', 'WATRWAL3'], 4]
        ];

        return raw.map((entry) => ({isFlat: entry[0], frames: entry[1], speedTics: entry[2]}));
    }

    // Heretic pairs its switches by ON/OFF suffix, not by SW1↔SW2 prefix
    // (UZDoom animdefs.txt: switch heretic SW1OFF on pic SW1ON…) — without
    // these the generic prefix rule would swap SW1OFF to the WRONG texture
    // SW2OFF (which exists: silent visual bug).
    switchPairs() {
        return [
            ['SW1OFF', 'SW1ON'],
            ['SW2OFF', 'SW2ON']
        ];
    }

    // Heretic skies by episode (UZDoom mapinfo/heretic.txt: E4 reuses SKY1,
    // E5 reuses SKY3; the hidden E6 slots default to SKY1).
    skyForLevel(levelName) {
        const byEpisode = {1: 'SKY1', 2: 'SKY2', 3: 'SKY3', 4: 'SKY1', 5: 'SKY3'};
        const ep = (/^E(\d)M\d/i).exec(levelName);
        const name = ((ep !== null) ? (byEpisode[parseInt(ep[1], 10)] ?? 'SKY1') : 'SKY1');

        return {name: name, wrap: 4};
    }

    // No Heretic decal set yet (it lands with the arsenal): no external
    // graphics, no templates — DoomDecals builds nothing under this profile.
    decalAssets() {
        return {basePath: '', keys: []};
    }

    decalTemplates() {
        return [];
    }

    /**
     * Sources: xlat/heretic.txt overrides of xlat/base.txt.
     *
     * @returns {object}
     */
    linedefSpecialMap() {
        return {
            // Stairs run at FLOORSPEED (1 u/tic, F_SLOW) instead of 0.25/4
            7:   1007,
            8:   1008,
            106: 1106,
            107: 1107,
            // 28/33 open with the GREEN key (Heretic has no red key)
            28:  1028,
            33:  1033,
            // USE ceiling lower-and-crush (close-stay at floor+8), not a
            // perpetual crusher like Doom's 49
            49:  1049,
            // Scroll texture RIGHT (Doom 99 is a blazing blue-key door)
            99:  1099,
            // WR door raise at D_SLOW*3 = 6 u/tic (Doom 100 is turbo stairs)
            100: 1100,
            // W1 secret exit (Doom already has it as 124)
            105: 124,
            // Thing_Destroy of the E1M8 boss walls — needs enemies, dropped
            515: 0
        };
    }

    /**
     * The Heretic behaviours the baseline lacks, injected into the
     * WadConstants tables under the synthetic codes emitted by the two maps
     * above (namespace >= 1000, wiped and re-applied at each level build):
     * green-key doors 1028/1033, WR door 1100 at D_SLOW*3 = 6 u/tic, USE
     * ceiling lower-and-crush 1049 (close-stay at floor+8, crush damage 0 in
     * the xlat → same stall+slow pressure as Doom 44/72), stairs at
     * FLOORSPEED = 1 u/tic (1007/1008 step 8, 1106/1107 step 16), rightward
     * texture scroll 1099, and the lava/sludge sector damages (specials.cpp
     * SetupSectorDamage: lava 5/16 tics leak 256, hefty lava 8/16 leak 256,
     * sludge 4/32 leak 0 — 1204 also scrolls the flat east in vanilla, the
     * carry is not implemented, damage only).
     *
     * @returns {object}
     */
    wadConstantsExtensions() {
        return {
            DOOR_BY_SPECIAL: {
                1028: {kind: 'open',  speed: 2, trigger: 'action',    anim: 'round-trip', loop: false, onlyOnce: false, key: 'greenKey'},
                1033: {kind: 'open',  speed: 2, trigger: 'action',    anim: 'one-way',    loop: false, onlyOnce: true,  key: 'greenKey'},
                1100: {kind: 'open',  speed: 6, trigger: 'proximity', anim: 'round-trip', loop: false, onlyOnce: false, key: null},
                1049: {kind: 'close', speed: 1, trigger: 'none',      anim: 'close-stay', loop: false, onlyOnce: true,  key: null, closeMargin: 8}
            },
            STAIR_BY_SPECIAL: {
                1007: {activation: 'switch', step: 8,  speed: 1},
                1008: {activation: 'walk',   step: 8,  speed: 1},
                1106: {activation: 'walk',   step: 16, speed: 1},
                1107: {activation: 'switch', step: 16, speed: 1}
            },
            SWITCH_SPECIALS: [1007, 1107, 1049],
            WALK_TRIGGER_ONCE_BY_SPECIAL: {1100: false, 1008: true, 1106: true},
            SCROLL_WALL_BY_SPECIAL: {1099: -35},
            SECTOR_DAMAGE_BY_SPECIAL: {
                1204: {damage: 5, windowTics: 16, leak: 256},
                1205: {damage: 5, windowTics: 16, leak: 256},
                1207: {damage: 4, windowTics: 32, leak: 0},
                1216: {damage: 8, windowTics: 16, leak: 256}
            }
        };
    }

    /**
     * Identity when absent, 0 = dropped (documented no-ops: wind/current
     * 20-51, low friction 15, phased-light sequences share the same range).
     *
     * @returns {object}
     */
    sectorSpecialMap() {
        const map = {
            4:  1204,
            5:  1205,
            7:  1207,
            16: 1216,
            15: 0,
            17: 0
        };
        for (let special = 20; special <= 51; special++) {
            map[special] = 0;
        }
        return map;
    }
}
