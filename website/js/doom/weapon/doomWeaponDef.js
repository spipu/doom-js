// Full weapon definition: fire behaviour + the psprite state machine, ported
// state-for-state from d_items.c / info.c / p_pspr.c. A state tuple is
// [frame, tics, action, next]; the "main" group renders the weapon sprite, the
// "flash" group the (fullbright) muzzle-flash sprite. Values are vanilla.
class DoomWeaponDef extends DoomWeapon {
    constructor(data) {
        // perShot (inherited) carries the ammo spent per shot (1, 2 for the SSG,
        // BFGCELLS for the BFG); no separate ammoUse field.
        super({ code: data.code, name: data.name, ammoType: data.ammoType, perShot: data.ammoUse ?? 0, damage: 0 });
        this._pellets       = data.pellets ?? 1;
        this._spreadH       = data.spreadH ?? 0;
        this._spreadV       = data.spreadV ?? 0;
        this._range         = data.range ?? 0;
        this._projectile    = data.projectile ?? null;
        this._autoFire      = (data.autoFire !== false);
        this._accurateFirst = (data.accurateFirst === true);
        this._viewSprite    = data.viewSprite;
        this._flashSprite   = data.flashSprite ?? null;
        this._entry         = data.entry;
        this._states        = this._buildStates(data);
    }

    _buildStates(data) {
        const states = {};
        const add = (group, sprite, bright) => {
            if (!group) {
                return;
            }
            for (const key of Object.keys(group)) {
                const [frame, tics, action, next] = group[key];
                states[key] = new DoomWeaponState(sprite, frame, tics, action ?? null, next ?? null, bright);
            }
        };
        add(data.main,  this._viewSprite,  false);
        add(data.flash, this._flashSprite, true);
        return states;
    }

    getPellets() {
        return this._pellets;
    }

    getSpreadH() {
        return this._spreadH;
    }

    getSpreadV() {
        return this._spreadV;
    }

    getRange() {
        return this._range;
    }

    getProjectile() {
        return this._projectile;
    }

    isAutoFire() {
        return this._autoFire;
    }

    isAccurateFirst() {
        return this._accurateFirst;
    }

    getEntry() {
        return this._entry;
    }

    getState(key) {
        return (this._states[key] ?? null);
    }

    // Every sprite lump this weapon can show (view + flash frames), so they can
    // be decoded up front during the level batch rather than mid-render.
    getSpriteLumps() {
        return Object.keys(this._states).map((key) => this._states[key].getLump());
    }

    // The 9 weapons in canonical loadout order. Ranges are in world units
    // (Doom units / 64: MELEERANGE 64 → 1, MISSILERANGE 2048 → 32). Spreads are
    // degrees per DoomRandom difference unit (horizontal <<18 / <<19, the SSG
    // vertical slope <<5 turned into a pitch angle).
    static buildAll() {
        const MELEE = 1.0, HITSCAN = 32.0;
        const SPREAD = 360 / 16384;
        const SSG_H  = 360 / 8192;
        const SSG_V  = (180 / Math.PI) / 2048;
        const READY  = { ready: 'ready', down: 'down', up: 'up', atk: 'fire1', flash: 'flash1' };

        const data = [
            {
                code: 'fist', name: 'Fist', ammoType: null, ammoUse: 0,
                pellets: 1, spreadH: SPREAD, range: MELEE,
                viewSprite: 'PUNG', entry: { ready: 'ready', down: 'down', up: 'up', atk: 'fire1' },
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['B', 4, null, 'fire2'], fire2: ['C', 4, 'punch', 'fire3'], fire3: ['D', 5, null, 'fire4'],
                    fire4: ['C', 4, null, 'fire5'], fire5: ['B', 5, 'refire', 'ready'],
                },
            },
            {
                code: 'chainsaw', name: 'Chainsaw', ammoType: null, ammoUse: 0,
                pellets: 1, spreadH: SPREAD, range: MELEE,
                viewSprite: 'SAWG', entry: { ready: 'ready', down: 'down', up: 'up', atk: 'fire1' },
                main: {
                    ready: ['C', 4, 'ready', 'readyB'], readyB: ['D', 4, 'ready', 'ready'],
                    down: ['C', 1, 'lower', 'down'], up: ['C', 1, 'raise', 'up'],
                    fire1: ['A', 4, 'saw', 'fire2'], fire2: ['B', 4, 'saw', 'fire3'], fire3: ['B', 0, 'refire', 'ready'],
                },
            },
            {
                code: 'pistol', name: 'Pistol', ammoType: 'bullets', ammoUse: 1,
                pellets: 1, spreadH: SPREAD, range: HITSCAN, accurateFirst: true,
                viewSprite: 'PISG', flashSprite: 'PISF', entry: READY,
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['A', 4, null, 'fire2'], fire2: ['B', 6, 'firePistol', 'fire3'],
                    fire3: ['C', 4, null, 'fire4'], fire4: ['B', 5, 'refire', 'ready'],
                },
                flash: { flash1: ['A', 7, 'light1', null] },
            },
            {
                code: 'shotgun', name: 'Shotgun', ammoType: 'shells', ammoUse: 1,
                pellets: 7, spreadH: SPREAD, range: HITSCAN,
                viewSprite: 'SHTG', flashSprite: 'SHTF', entry: READY,
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['A', 3, null, 'fire2'], fire2: ['A', 7, 'fireShotgun', 'fire3'], fire3: ['B', 5, null, 'fire4'],
                    fire4: ['C', 5, null, 'fire5'], fire5: ['D', 4, null, 'fire6'], fire6: ['C', 5, null, 'fire7'],
                    fire7: ['B', 5, null, 'fire8'], fire8: ['A', 3, null, 'fire9'], fire9: ['A', 7, 'refire', 'ready'],
                },
                flash: { flash1: ['A', 4, 'light1', 'flash2'], flash2: ['B', 3, 'light2', null] },
            },
            {
                code: 'supershotgun', name: 'Super Shotgun', ammoType: 'shells', ammoUse: 2,
                pellets: 20, spreadH: SSG_H, spreadV: SSG_V, range: HITSCAN,
                viewSprite: 'SHT2', flashSprite: 'SHT2', entry: READY,
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['A', 3, null, 'fire2'], fire2: ['A', 7, 'fireShotgun2', 'fire3'], fire3: ['B', 7, null, 'fire4'],
                    fire4: ['C', 7, 'checkReload', 'fire5'], fire5: ['D', 7, 'openShotgun2', 'fire6'], fire6: ['E', 7, null, 'fire7'],
                    fire7: ['F', 7, 'loadShotgun2', 'fire8'], fire8: ['G', 6, null, 'fire9'], fire9: ['H', 6, 'closeShotgun2', 'fire10'],
                    fire10: ['A', 5, 'refire', 'ready'],
                },
                flash: { flash1: ['I', 5, 'light1', 'flash2'], flash2: ['J', 4, 'light2', null] },
            },
            {
                code: 'chaingun', name: 'Chaingun', ammoType: 'bullets', ammoUse: 1,
                pellets: 1, spreadH: SPREAD, range: HITSCAN, accurateFirst: true,
                viewSprite: 'CHGG', flashSprite: 'CHGF', entry: READY,
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['A', 4, 'fireCGun1', 'fire2'], fire2: ['B', 4, 'fireCGun2', 'fire3'], fire3: ['B', 0, 'refire', 'ready'],
                },
                flash: { flash1: ['A', 5, 'light1', null], flash2: ['B', 5, 'light2', null] },
            },
            {
                code: 'rocket', name: 'Rocket Launcher', ammoType: 'rockets', ammoUse: 1,
                projectile: 'rocket', autoFire: false,
                viewSprite: 'MISG', flashSprite: 'MISF', entry: READY,
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['B', 8, 'gunFlash', 'fire2'], fire2: ['B', 12, 'fireMissile', 'fire3'], fire3: ['B', 0, 'refire', 'ready'],
                },
                flash: {
                    flash1: ['A', 3, 'light1', 'flash2'], flash2: ['B', 4, null, 'flash3'],
                    flash3: ['C', 4, 'light2', 'flash4'], flash4: ['D', 4, 'light2', null],
                },
            },
            {
                code: 'plasma', name: 'Plasma Rifle', ammoType: 'cells', ammoUse: 1,
                projectile: 'plasma',
                viewSprite: 'PLSG', flashSprite: 'PLSF', entry: READY,
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['A', 3, 'firePlasma', 'fire2'], fire2: ['B', 20, 'refire', 'ready'],
                },
                flash: { flash1: ['A', 4, 'light1', null], flash2: ['B', 4, 'light1', null] },
            },
            {
                code: 'bfg', name: 'BFG9000', ammoType: 'cells', ammoUse: 40,
                projectile: 'bfg', autoFire: false,
                viewSprite: 'BFGG', flashSprite: 'BFGF', entry: READY,
                main: {
                    ready: ['A', 1, 'ready', 'ready'], down: ['A', 1, 'lower', 'down'], up: ['A', 1, 'raise', 'up'],
                    fire1: ['A', 20, 'bfgSound', 'fire2'], fire2: ['B', 10, 'gunFlash', 'fire3'],
                    fire3: ['B', 10, 'fireBFG', 'fire4'], fire4: ['B', 20, 'refire', 'ready'],
                },
                flash: { flash1: ['A', 11, 'light1', 'flash2'], flash2: ['B', 6, 'light2', null] },
            },
        ];

        const catalog = {};
        for (const d of data) {
            catalog[d.code] = new DoomWeaponDef(d);
        }
        return catalog;
    }
}
