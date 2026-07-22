// Full weapon definition: fire behaviour + the psprite state machine, ported
// state-for-state from the game sources (d_items.c / info.c / p_pspr.c for
// Doom, the zscript actors for Heretic). A state tuple is [frame, tics,
// action, next, bright?] (bright forces fullbright on a single main state);
// the "main" group renders the weapon sprite, the "flash" group the
// (fullbright) muzzle-flash sprite. All values come from the game profile.
class DoomWeaponDef extends DoomWeapon {
    constructor(data) {
        // perShot (inherited) carries the ammo spent per shot (1, 2 for the SSG,
        // BFGCELLS for the BFG); no separate ammoUse field.
        super({ code: data.code, name: data.name, ammoType: data.ammoType, perShot: data.ammoUse ?? 0, damage: 0 });
        this._pellets       = data.pellets ?? 1;
        this._spreadH       = data.spreadH ?? 0;
        this._spreadV       = data.spreadV ?? 0;
        this._range         = data.range ?? 0;
        // Per-pellet damage roll {base, dice, flat?} → flat + base×(1..dice),
        // straight from the game sources; kickback drives the victim thrust
        // (null = the game's defKickback rule, an explicit 0 pins the target —
        // chainsaw/gauntlets); berserkFactor multiplies the fist under the
        // strength power-up; puffOnMonsters shows the puff on flesh (Heretic
        // sparks) instead of hiding it behind the blood.
        this._damageSpec    = data.damage ?? null;
        this._kickback      = data.kickback ?? null;
        this._berserkItem   = data.berserkItem ?? null;
        this._berserkFactor = data.berserkFactor ?? 1;
        this._puffOnMonsters = (data.puffOnMonsters === true);
        this._projectiles   = data.projectiles ?? [];
        this._puffType      = data.puffType ?? null;
        this._decalType     = data.decalType ?? null;
        this._ammoGive      = data.ammoGive ?? null;
        this._yAdjust       = data.yAdjust ?? 0;
        this._autoFire      = (data.autoFire !== false);
        this._accurateFirst = (data.accurateFirst === true);
        this._viewSprite    = data.viewSprite;
        this._flashSprite   = data.flashSprite ?? null;
        this._entry         = data.entry;
        this._states        = this._buildStates(data);
    }

    _buildStates(data) {
        const states = {};
        const add = (group, sprite, groupBright) => {
            if (!group) {
                return;
            }
            for (const key of Object.keys(group)) {
                const [frame, tics, action, next, bright] = group[key];
                states[key] = new DoomWeaponState(sprite, frame, tics, action ?? null, next ?? null, (groupBright || (bright === true)));
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

    // Shots spawned per fire action: [{kind, angleOffset?, randomSpreadH?}] —
    // several entries make a fan (the Heretic crossbow).
    getProjectiles() {
        return this._projectiles;
    }

    getPuffType() {
        return this._puffType;
    }

    getDamageSpec() {
        return this._damageSpec;
    }

    getKickback() {
        return this._kickback;
    }

    // Inventory item code whose possession multiplies the damage by the
    // berserk factor (the Doom fist under the strength power-up); null = the
    // weapon never gets boosted.
    getBerserkItem() {
        return this._berserkItem;
    }

    getBerserkFactor() {
        return this._berserkFactor;
    }

    isPuffOnMonsters() {
        return this._puffOnMonsters;
    }

    getDecalType() {
        return this._decalType;
    }

    // Ammo handed out with the weapon pickup; null = the generic 2 × clip rule.
    getAmmoGive() {
        return this._ammoGive;
    }

    // Vertical view-sprite offset (gzdoom Weapon.YAdjust, 320x200 pixels).
    getYAdjust() {
        return this._yAdjust;
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
