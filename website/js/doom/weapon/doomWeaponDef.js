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
}
