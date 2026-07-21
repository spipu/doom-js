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
            episodeSecretReturns: {1: 'E1M7', 2: 'E2M5', 3: 'E3M5', 4: 'E4M5', 5: 'E5M4'},
            // Hidden episode 6 loops forever (UZDoom mapinfo/heretic.txt:
            // E6M1→E6M2→E6M3→E6M1, both exits). E6M1/E6M2 already chain by
            // lump order; only the loop-back needs an explicit route.
            explicitRoutes: {E6M3: {next: 'E6M1', nextsecret: 'E6M1'}}
        };
    }

    // Heretic world things: editor numbers, sprite frames, radii and flags
    // transcribed from the UZDoom sources (mapinfo/heretic.txt DoomEdNums +
    // zscript/actors/heretic/ and actors/raven/) — never from memory.
    // Enemies, starts, ambient-sound things (41/42/1200-1209), generators
    // (43/52/74), BossSpot (56) and the Bridge (118) are absent on purpose
    // (silent skip). Inventory artifacts with no transposable effect (egg,
    // time bomb, chaos device, tome, wings) are visible pickups with a null
    // effect: never consumed, they stay.
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
            // MaceSpawner: vanilla materializes ONE mace per level among all
            // its spawner spots (P_RepositionMace) — spawnerGroup keeps a
            // single random one (user-validated choice).
            2002: {kind: 'pickup', sprite: 'WMCEA0', spawnerGroup: 'mace', effect: {weapon: 'mace'}},
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

    // The Heretic arsenal in slot order (PL1 mode only — the Tome of Power is
    // out of scope), ported state-for-state from the UZDoom zscript actors
    // (zscript/actors/heretic/weapon*.zs). Spread: Random2() * (5.625/256)°
    // per difference unit = exactly the Doom SPREAD constant (360/16384).
    // Ranges in world units (DEFMELEERANGE 64 → 1, PLAYERMISSILERANGE 8192 →
    // 128). No Heretic weapon has a muzzle-flash psprite; ammoGive carries the
    // per-weapon pickup amounts (Weapon.AmmoGive); yAdjust lowers the view
    // sprites like gzdoom (15, the wand 5, the staff 0).
    buildWeapons() {
        const MELEE   = 1.0;
        const HITSCAN = 128.0;
        const SPREAD  = 360 / 16384;
        const ENTRY   = { ready: 'ready', down: 'down', up: 'up', atk: 'fire1' };

        const data = [
            {
                code: 'staff', name: 'Staff', ammoType: null, ammoUse: 0,
                pellets: 1, spreadH: SPREAD, range: MELEE,
                puffType: 'staffPuff',
                viewSprite: 'STFF', entry: ENTRY,
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['B', 6, null, 'fire2'], fire2: ['C', 8, 'fireMelee', 'fire3'], fire3: ['B', 8, 'refire', 'ready'],
                },
            },
            {
                code: 'gauntlets', name: 'Gauntlets', ammoType: null, ammoUse: 0,
                pellets: 1, spreadH: SPREAD, range: MELEE, yAdjust: 15,
                puffType: 'gauntletPuff',
                viewSprite: 'GAUN', entry: { ready: 'ready', down: 'down', up: 'up', atk: 'fire1', hold: 'hold1' },
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['B', 4, null, 'fire2'], fire2: ['C', 4, null, 'hold1'],
                    hold1: ['D', 4, 'fireMelee', 'hold2', true], hold2: ['E', 4, 'fireMelee', 'hold3', true],
                    hold3: ['F', 4, 'fireMelee', 'hold4', true], hold4: ['C', 4, 'refire', 'hold5'],
                    hold5: ['B', 4, null, 'ready'],
                },
            },
            {
                code: 'goldwand', name: 'Gold Wand', ammoType: 'crystals', ammoUse: 1, ammoGive: 25,
                pellets: 1, spreadH: SPREAD, range: HITSCAN, accurateFirst: true, yAdjust: 5,
                puffType: 'goldwandPuff', decalType: 'railscorch',
                viewSprite: 'GWND', entry: ENTRY,
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['B', 3, null, 'fire2'], fire2: ['C', 5, 'fireHitscan', 'fire3'],
                    fire3: ['D', 3, null, 'fire4'], fire4: ['D', 0, 'refire', 'ready'],
                },
            },
            {
                code: 'crossbow', name: 'Ethereal Crossbow', ammoType: 'arrows', ammoUse: 1, ammoGive: 10,
                yAdjust: 15,
                projectiles: [
                    {kind: 'crossbowfx1'},
                    {kind: 'crossbowfx3', angleOffset: -4.5},
                    {kind: 'crossbowfx3', angleOffset: 4.5}
                ],
                viewSprite: 'CRBW', entry: ENTRY,
                main: {
                    ...this._animatedReadyStates('AAAAAABBBBBBCCCCCC'),
                    down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['D', 6, 'fireProjectiles', 'fire2'],
                    fire2: ['E', 3, null, 'fire3'], fire3: ['F', 3, null, 'fire4'],
                    fire4: ['G', 3, null, 'fire5'], fire5: ['H', 3, null, 'fire6'],
                    fire6: ['A', 4, null, 'fire7'], fire7: ['B', 4, null, 'fire8'],
                    fire8: ['C', 5, 'refire', 'ready'],
                },
            },
            {
                code: 'blaster', name: 'Dragon Claw', ammoType: 'orbs', ammoUse: 1, ammoGive: 30,
                pellets: 1, spreadH: SPREAD, range: HITSCAN, accurateFirst: true, yAdjust: 15,
                puffType: 'blasterPuff', decalType: 'railscorch',
                viewSprite: 'BLSR', entry: { ready: 'ready', down: 'down', up: 'up', atk: 'fire1', hold: 'hold1' },
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['B', 3, null, 'fire2'], fire2: ['C', 3, null, 'hold1'],
                    hold1: ['D', 2, 'fireHitscan', 'hold2'], hold2: ['C', 2, null, 'hold3'],
                    hold3: ['B', 2, null, 'hold4'], hold4: ['A', 0, 'refire', 'ready'],
                },
            },
            {
                code: 'skullrod', name: 'Hellstaff', ammoType: 'runes', ammoUse: 1, ammoGive: 50,
                yAdjust: 15,
                projectiles: [{kind: 'hornrodfx1'}],
                viewSprite: 'HROD', entry: ENTRY,
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['A', 4, 'fireProjectiles', 'fire2'], fire2: ['B', 4, 'fireProjectiles', 'fire3'],
                    fire3: ['B', 0, 'refire', 'ready'],
                },
            },
            {
                code: 'phoenixrod', name: 'Phoenix Rod', ammoType: 'flameorbs', ammoUse: 1, ammoGive: 2,
                yAdjust: 15, autoFire: false,
                projectiles: [{kind: 'phoenixfx1'}],
                viewSprite: 'PHNX', entry: ENTRY,
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['B', 5, null, 'fire2'], fire2: ['C', 7, 'fireProjectiles', 'fire3'],
                    fire3: ['D', 4, null, 'fire4'], fire4: ['B', 4, null, 'fire5'],
                    fire5: ['B', 0, 'refire', 'ready'],
                },
            },
            {
                code: 'mace', name: 'Firemace', ammoType: 'spheres', ammoUse: 1, ammoGive: 50,
                yAdjust: 15,
                projectiles: [{kind: 'macefx1', randomSpreadH: SPREAD, altKind: 'macefx2', altChance: 28}],
                viewSprite: 'MACE', entry: { ready: 'ready', down: 'down', up: 'up', atk: 'fire1', hold: 'hold1' },
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['B', 4, null, 'hold1'],
                    hold1: ['C', 3, 'fireProjectiles', 'hold2'], hold2: ['D', 3, 'fireProjectiles', 'hold3'],
                    hold3: ['E', 3, 'fireProjectiles', 'hold4'], hold4: ['F', 3, 'fireProjectiles', 'hold5'],
                    hold5: ['C', 4, 'refire', 'hold6'], hold6: ['D', 4, null, 'hold7'],
                    hold7: ['E', 4, null, 'hold8'], hold8: ['F', 4, null, 'hold9'],
                    hold9: ['B', 4, null, 'ready'],
                },
            },
        ];

        const catalog = {};
        for (const entry of data) {
            catalog[entry.code] = new DoomWeaponDef(entry);
        }
        return catalog;
    }

    // The crossbow idles on an 18-frame 1-tic animation (CRBW A×6 B×6 C×6),
    // each state running A_WeaponReady like vanilla — generated as a chained
    // loop the generic state machine consumes as-is.
    _animatedReadyStates(letters) {
        const states = {};
        for (let i = 0; i < letters.length; i++) {
            const key  = ((i === 0) ? 'ready' : 'ready' + (i + 1));
            const next = ((i === (letters.length - 1)) ? 'ready' : 'ready' + (i + 2));
            states[key] = [letters[i], 1, 'ready', next];
        }
        return states;
    }

    // Heretic hitscan puffs (zscript actors): the staff/gauntlet hits are
    // translucent rising puffs (Alpha 0.4, VSpeed 1 / 0.8), the wand/claw
    // sparks glow (RenderStyle Add, default alpha). The claw impact is
    // BlasterPuff's Crash branch (FX17 ABCDE, the Spawn branch is its
    // powered-mode in-flight puff).
    weaponEffectTemplates() {
        return [
            {name: 'staffPuff',       sprite: 'PUF3', letters: ['A', 'B', 'C', 'D'],      frameTics: [4, 4, 4, 4],    alpha: 0.4, rise: 1,   additive: false},
            {name: 'gauntletPuff',    sprite: 'PUF1', letters: ['A', 'B', 'C', 'D'],      frameTics: [4, 4, 4, 4],    alpha: 0.4, rise: 0.8, additive: false},
            {name: 'goldwandPuff',    sprite: 'PUF2', letters: ['A', 'B', 'C', 'D', 'E'], frameTics: [3, 3, 3, 3, 3], alpha: 1,   rise: 0,   additive: true},
            {name: 'blasterPuff',     sprite: 'FX17', letters: ['A', 'B', 'C', 'D', 'E'], frameTics: [4, 4, 4, 4, 4], alpha: 1,   rise: 0,   additive: true},
            // Projectile deaths (zscript Death states): the bolts and the
            // hellstaff burst glow (Add), the phoenix explosion and the mace
            // ball break are plain bright frames.
            {name: 'crossbowExplode1', sprite: 'FX03', letters: ['H', 'I', 'J'],                     frameTics: [8, 8, 8],                alpha: 1,   rise: 0, additive: true},
            {name: 'crossbowExplode3', sprite: 'FX03', letters: ['C', 'D', 'E'],                     frameTics: [8, 8, 8],                alpha: 1,   rise: 0, additive: true},
            {name: 'skullrodExplode',  sprite: 'FX00', letters: ['H', 'I', 'J', 'K', 'L', 'M'],      frameTics: [5, 5, 4, 4, 3, 3],       alpha: 1,   rise: 0, additive: true},
            {name: 'phoenixExplode',   sprite: 'FX08', letters: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], frameTics: [6, 5, 5, 4, 4, 4, 4, 4], alpha: 1, rise: 0, additive: false},
            {name: 'phoenixTrail',     sprite: 'FX04', letters: ['B', 'C', 'D', 'E', 'F'],           frameTics: [4, 4, 4, 4, 4],          alpha: 0.4, rise: 0, additive: false},
            {name: 'maceExplode',      sprite: 'FX02', letters: ['F', 'G', 'H', 'I', 'J'],           frameTics: [4, 4, 4, 4, 4],          alpha: 1,   rise: 0, additive: false}
        ];
    }

    // The Heretic projectiles (zscript actors, PL1): speed in map units/tic.
    // The mace ball flies straight 16 tics then drops (A_MacePL1Check:
    // gravity 1/8, horizontal speed rescaled to 7, vertical halved) — no
    // bounce (agreed simplification: it breaks on first impact). The phoenix
    // shot carries the A_Explode 128 splash and leaves its FX04 puff trail.
    // The additive shots (bolts, hellstaff) are RenderStyle "Add" with the
    // default actor alpha (1.0) in the zscript — same value as their death
    // frames in weaponEffectTemplates.
    projectileDefs() {
        return [
            {kind: 'crossbowfx1', sprite: 'FX03', letters: ['B'],      speed: 30, flightTics: 1, explosion: 'crossbowExplode1', splashDamage: 0,   alpha: 1, additive: true,  decalType: 'cbowmark'},
            {kind: 'crossbowfx3', sprite: 'FX03', letters: ['A'],      speed: 20, flightTics: 1, explosion: 'crossbowExplode3', splashDamage: 0,   alpha: 1, additive: true,  decalType: 'cbowmark2'},
            {kind: 'hornrodfx1',  sprite: 'FX00', letters: ['A', 'B'], speed: 22, flightTics: 6, explosion: 'skullrodExplode',  splashDamage: 0,   alpha: 1, additive: true,  decalType: 'hornscorch'},
            {kind: 'phoenixfx1',  sprite: 'FX04', letters: ['A'],      speed: 20, flightTics: 1, explosion: 'phoenixExplode',   splashDamage: 128, alpha: 1, additive: false, decalType: 'phoenixscorch', trailEffect: 'phoenixTrail', trailEveryTics: 4},
            {kind: 'macefx1',     sprite: 'FX02', letters: ['A', 'B'], speed: 20, flightTics: 4, explosion: 'maceExplode',      splashDamage: 0,   alpha: 1, additive: false, decalType: 'macescorch', gravity: 0.125, gravityDelayTics: 16, dropSpeed: 7, bounce: {damping: 0.75, maxBounces: 1}},
            // The rare lobbed ball (28/256 of A_FireMacePL1 shots): flat launch
            // at Speed 10 + pitch-driven vertical kick, gravity 0.125 from the
            // first tic, same death frames as the normal ball. Bounces while
            // its energy holds, spitting two sideways FX3 each time.
            {kind: 'macefx2',     sprite: 'FX02', letters: ['C', 'D'], speed: 10, flightTics: 4, explosion: 'maceExplode',      splashDamage: 0,   alpha: 1, additive: false, decalType: 'macescorch', gravity: 0.125, lob: true, bounce: {damping: 0.75, minVz: 2, spawnKind: 'macefx3'}},
            // The tiny side balls spat by an FX2 bounce — one bounce each,
            // like the normal ball (they inherit MaceFX1's impact).
            {kind: 'macefx3',     sprite: 'FX02', letters: ['A', 'B'], speed: 7,  flightTics: 4, explosion: 'maceExplode',      splashDamage: 0,   alpha: 1, additive: false, decalType: 'macescorch', gravity: 0.125, bounce: {damping: 0.75, maxBounces: 1}}
        ];
    }

    // Heretic weapon-preference chain when a weapon runs dry, from the zscript
    // SelectionOrder values (lower = preferred: skullrod 200, blaster 500,
    // crossbow 800, mace 1400, goldwand 2000, gauntlets 2300, phoenixrod 2600,
    // staff 3800 = the unconditional fallback).
    weaponFallbackOrder() {
        return [
            {code: 'skullrod'},
            {code: 'blaster'},
            {code: 'crossbow'},
            {code: 'mace'},
            {code: 'goldwand'},
            {code: 'gauntlets'},
            {code: 'phoenixrod'},
            {code: 'staff'}
        ];
    }

    // Full-kit cheat armour: the Enchanted Shield (zscript hereticarmor.zs,
    // Armor.Saveamount 200, Savepercent 75).
    cheatKitArmor() {
        return {points: 200, absorb: 0.75};
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

    // Canonical Heretic start (zscript hereticplayer.zs Player.StartItem):
    // Staff + Gold Wand owned, the wand up, 50 wand crystals.
    startingLoadout() {
        return {
            weapons:      ['staff', 'goldwand'],
            activeWeapon: 'goldwand',
            ammo:         {crystals: 50},
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

    // The UZDoom impact-decal graphics specific to Heretic (GPL v3,
    // website/assets/uzdoom/heretic/). The boot loader takes the union of
    // every profile's assets with key dedup: the templates below may also
    // reference the plasma1/plasma2/scorch1 keys already loaded by the Doom
    // profile (same UZDoom graphics).
    decalAssets() {
        return {
            basePath: '/assets/uzdoom/heretic/sprite/',
            keys: ['cbowmark', 'cbalscr1', 'cbalscr2', 'bal7scr1', 'bal7scr2']
        };
    }

    // Faithful to UZDoom's decaldef.txt generators: GoldWand/Blaster hitscans
    // → RailScorchLower (CBALSCR 0.2), CrossbowFX1/FX3 → CrossbowScorch
    // (CBOWMARK 0.4 / 0.25), HornRodFX1 → PlasmaScorchLower (PLASMA 0.3),
    // PhoenixFX1 → Scorch (SCORCH1 0.5), MaceFX1 → BaronScorch (BAL7SCR 0.5).
    // translucent/gain follow the equivalent Doom templates (soft burns
    // lifted above the shader's a<0.5 cutout).
    decalTemplates() {
        return [
            {type: 'railscorch',    keys: ['cbalscr1', 'cbalscr2'], scale: 0.2,  shade: [0, 0, 0], translucent: 1,    gain: 2.2},
            {type: 'cbowmark',      keys: ['cbowmark'],             scale: 0.4,  shade: [0, 0, 0], translucent: 0.85, gain: 1.0},
            {type: 'cbowmark2',     keys: ['cbowmark'],             scale: 0.25, shade: [0, 0, 0], translucent: 0.85, gain: 1.0},
            {type: 'hornscorch',    keys: ['plasma1', 'plasma2'],   scale: 0.3,  shade: [0, 0, 0], translucent: 1,    gain: 2.2},
            {type: 'phoenixscorch', keys: ['scorch1'],              scale: 0.5,  shade: [0, 0, 0], translucent: 1,    gain: 1.8},
            {type: 'macescorch',    keys: ['bal7scr1', 'bal7scr2'], scale: 0.5,  shade: [0, 0, 0], translucent: 1,    gain: 2.2}
        ];
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
     * texture scroll 1099, the lava/sludge sector damages (specials.cpp
     * SetupSectorDamage: lava 5/16 tics leak 256, hefty lava 8/16 leak 256,
     * sludge 4/32 leak 0), the sector pushes (winds 1040-1051, conveyors
     * 1021-1039, scrolling lava 1204 — see _sectorPushTable) and the ice
     * ground 1015.
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
            },
            SECTOR_PUSH_BY_SPECIAL: this._sectorPushTable(),
            // Ice ground (dFriction_Low): per-tic momentum keep = 0xF900/0x10000
            SECTOR_FRICTION_BY_SPECIAL: {1015: {friction: 0.97265625}},
            // Vanilla only scrolls the floor flat for the EAST carriers and the
            // lava (specials.cpp: -0.5 × 2^n, lava -4) — map units per tic east
            SECTOR_FLAT_SCROLL_BY_SPECIAL: {1020: 0.5, 1021: 1, 1022: 2, 1023: 4, 1024: 8, 1204: 4}
        };
    }

    /**
     * Player pushes of the Heretic sector specials, in map units per tic
     * (UZDoom p_mobj.cpp:4809-4834 + 2410-2437). Carriers 20-39 (→ 1020-1039)
     * are terminal carry speeds: the east family uses the modern GZDoom values
     * matched to the scrolling texture (0.5/1/2/4/8 — user choice; the 0.5
     * step sits below CARRYSTOPSPEED and pushes nothing, texture drift only,
     * hence no 1020 entry), north/south/west keep the original mul/3 speeds
     * (GZDoom only rebased the east). Winds 40-51 (→ 1040-1051) are per-tick
     * thrusts (windTab 5/32, 10/32, 25/32); the scrolling lava 1204 carries
     * east at 4.0 (12 / (32 × CARRYFACTOR)).
     *
     * @returns {object}
     */
    _sectorPushTable() {
        const push = {
            1021: {kind: 'carry', dx: 1, dz: 0},
            1022: {kind: 'carry', dx: 2, dz: 0},
            1023: {kind: 'carry', dx: 4, dz: 0},
            1024: {kind: 'carry', dx: 8, dz: 0},
            1204: {kind: 'carry', dx: 4, dz: 0}
        };
        const muls = [5, 10, 25, 30, 35];
        for (let step = 0; step < 5; step++) {
            const speed = muls[step] / 3;
            push[1025 + step] = {kind: 'carry', dx: 0,      dz: speed};
            push[1030 + step] = {kind: 'carry', dx: 0,      dz: -speed};
            push[1035 + step] = {kind: 'carry', dx: -speed, dz: 0};
        }
        const windTab = [5 / 32, 10 / 32, 25 / 32];
        for (let step = 0; step < 3; step++) {
            push[1040 + step] = {kind: 'wind', dx: windTab[step],  dz: 0};
            push[1043 + step] = {kind: 'wind', dx: 0,              dz: windTab[step]};
            push[1046 + step] = {kind: 'wind', dx: 0,              dz: -windTab[step]};
            push[1049 + step] = {kind: 'wind', dx: -windTab[step], dz: 0};
        }
        return push;
    }

    /**
     * Identity when absent, 0 = dropped (documented no-op: 17, phased-light
     * sequences). Winds/carriers 20-51 and the ice 15 map to their synthetic
     * push/friction codes (1000 + special).
     *
     * @returns {object}
     */
    sectorSpecialMap() {
        const map = {
            4:  1204,
            5:  1205,
            7:  1207,
            16: 1216,
            15: 1015,
            17: 0
        };
        for (let special = 20; special <= 51; special++) {
            map[special] = 1000 + special;
        }
        return map;
    }
}
