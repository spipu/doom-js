// The player's weapon logic — a faithful port of p_pspr.c. Owns the two
// psprites (weapon + muzzle flash), runs their state machine at 35 tics/s,
// bobs the weapon from the player's speed, drives the raise/lower on a
// retargetable pending weapon, consumes ammo and dispatches the fire actions
// to the injected attack systems (hitscan / projectiles). No rendering here:
// getViewSprites() hands the current frames to the engine's view-sprite pass.
class DoomPlayerWeapon {
    constructor(game, user, spriteBank, rng) {
        this._game       = game;
        this._user       = user;
        this._sprites    = spriteBank;
        this._rng        = rng;
        this._hitscan    = null;
        this._projectiles = null;

        this._weaponPsp = { stateKey: null, tics: 0 };
        this._flashPsp  = { stateKey: null, tics: 0 };
        this._motion    = new DoomWeaponMotion();   // on-screen offset + smoothing

        this._ready         = user.getActiveWeapon();
        this._pending       = null;
        this._refire        = 0;
        this._attackDown    = false;
        this._fireHeld      = false;
        this._light         = 1;
        this._noiseCallback = null;

        this._ticks = 0;
        this._acc   = 0;
        this._weaponDown = false;

        this._bringUpWeapon();
    }

    setAttackSystems(hitscan, projectiles) {
        this._hitscan     = hitscan;
        this._projectiles = projectiles;
        return this;
    }

    // Fired once per initiated attack (new press AND each refire cycle) —
    // the vanilla P_FireWeapon site of P_NoiseAlert, every weapon included.
    setNoiseCallback(callback) {
        this._noiseCallback = callback;
        return this;
    }

    // Sector-light factor (0..1) applied to the non-fullbright weapon sprite.
    setLight(light) {
        this._light = light;
    }

    // --- Frame update ---

    update(dtMs, fireHeld) {
        this._fireHeld = fireHeld;
        this._acc += dtMs;
        while (this._acc >= DoomPlayerWeapon.MS_PER_TIC) {
            this._acc  -= DoomPlayerWeapon.MS_PER_TIC;
            this._ticks += 1;
            if (this._user.isDead()) {
                // P_DropWeapon / A_Lower dead case: the weapon slides down at
                // LOWERSPEED and stays at the bottom — states frozen, muzzle
                // flash killed, vanilla never raises it again while dead.
                this._flashPsp.stateKey = null;
                this._weaponDown = this._motion.lower(DoomPlayerWeapon.LOWERSPEED);
                continue;
            }
            this._weaponDown = false;
            this._tickPsprite(this._weaponPsp);
            this._tickPsprite(this._flashPsp);
            this._motion.ease();
        }
    }

    _tickPsprite(psp) {
        if (psp.stateKey === null || psp.tics === -1) {
            return;
        }
        psp.tics -= 1;
        if (psp.tics <= 0) {
            this._setState(psp, this._stateOf(psp).getNext());
        }
    }

    // --- Weapon switching (retargetable pending weapon) ---

    requestWeapon(code) {
        if (code === null || !this._user.hasWeapon(code) || code === this._target()) {
            return;
        }
        this._pending = code;
    }

    cycleWeapon(dir) {
        const owned = this._user.getOwnedWeaponCodes();
        if (owned.length === 0) {
            return;
        }
        let i = owned.indexOf(this._target());
        if (i < 0) {
            i = 0;
        }
        this.requestWeapon(owned[(i + dir + owned.length) % owned.length]);
    }

    _target() {
        return ((this._pending !== null) ? this._pending : this._ready);
    }

    // --- View sprites for the renderer ---

    getViewSprites() {
        if (this._weaponDown) {
            return [];
        }
        const out    = [];
        const weapon = this._spriteDesc(this._weaponPsp, this._stateBright(this._weaponPsp));
        if (weapon !== null) {
            out.push(weapon);
        }
        const flash = this._spriteDesc(this._flashPsp, true);
        if (flash !== null) {
            out.push(flash);
        }
        return out;
    }

    // Descriptor for the engine's generic overlay primitive: the motion places
    // the sprite in 0..1 screen space; fullbright frames ignore sector shading.
    _spriteDesc(psp, bright) {
        if (psp.stateKey === null) {
            return null;
        }
        const spr = this._sprites.get(this._stateOf(psp).getLump());
        if (spr === null) {
            return null;
        }
        const rect = this._motion.screenRect(spr, this._def().getYAdjust());
        return {
            texId: spr.texId,
            x:     rect.x,
            y:     rect.y,
            w:     rect.w,
            h:     rect.h,
            light: ((bright) ? 1 : this._light),
        };
    }

    _stateBright(psp) {
        return this._stateOf(psp).isBright();
    }

    // --- State machine (P_SetPsprite / P_MovePsprites) ---

    _def() {
        return this._game.getWeapon(this._ready);
    }

    _stateOf(psp) {
        return this._def().getState(psp.stateKey);
    }

    _setState(psp, key) {
        let stnum = key;
        let guard = 0;
        do {
            if (stnum === null) {
                psp.stateKey = null;
                return;
            }
            const state = this._def().getState(stnum);
            psp.stateKey = stnum;
            psp.tics     = state.getTics();
            const action = state.getAction();
            if (action !== null) {
                this._runAction(action, psp);
                if (psp.stateKey === null) {
                    return;
                }
            }
            stnum = this._def().getState(psp.stateKey).getNext();
            guard += 1;
        } while (psp.tics === 0 && guard < 64);
    }

    // Generic fire verbs, fully parameterized by the weapon def (pellets,
    // spread, range, puff, decal, projectiles come from the profile data) —
    // no game-specific action name may appear here.
    _runAction(name, psp) {
        switch (name) {
            case 'ready':                    this._aWeaponReady();       break;
            case 'lower':                    this._aLower();             break;
            case 'raise':                    this._aRaise();             break;
            case 'refire':                   this._aReFire();            break;
            case 'gunFlash':                 this._aGunFlash();          break;
            case 'checkReload':              this._checkAmmo();          break;
            case 'fireMelee':                this._aMelee();             break;
            case 'fireHitscan':              this._aFireHitscan(this._accurateNow()); break;
            case 'fireHitscanFlash1':        this._aFireHitscanFlash('flash1'); break;
            case 'fireHitscanFlash2':        this._aFireHitscanFlash('flash2'); break;
            case 'fireProjectiles':          this._aFireProjectiles();   break;
            case 'fireProjectilesRandFlash': this._aFireProjectilesRandFlash(); break;
            // No-op: muzzle-flash extralight and reload sounds (no audio yet).
            // The state timing and the flash sprite are still played.
            case 'light1':
            case 'light2':
            case 'bfgSound':
            case 'openShotgun2':
            case 'loadShotgun2':
            case 'closeShotgun2':
            default:              break;
        }
    }

    // Accurate shot = a weapon flagged accurateFirst and not refiring (vanilla
    // pistol/chaingun first shot; Heretic goldwand/blaster outside refire).
    _accurateNow() {
        return (this._def().isAccurateFirst() && (this._refire === 0));
    }

    // --- Action functions (p_pspr.c) ---

    _aWeaponReady() {
        if (this._pending !== null) {
            this._setState(this._weaponPsp, this._def().getEntry().down);
            return;
        }
        if (this._fireHeld) {
            if (!this._attackDown || this._def().isAutoFire()) {
                this._attackDown = true;
                this._fireWeapon();
                return;
            }
        } else {
            this._attackDown = false;
        }
        this._motion.bobTarget(this._ticks, this._user.getRealVelocityXZ());
    }

    _aReFire() {
        if (this._fireHeld && this._pending === null) {
            this._refire += 1;
            this._fireWeapon();
            return;
        }
        this._refire = 0;
        this._checkAmmo();
    }

    _aLower() {
        if (!this._motion.lower(DoomPlayerWeapon.LOWERSPEED)) {
            return;
        }
        this._ready = ((this._pending !== null) ? this._pending : this._ready);
        this._bringUpWeapon();
    }

    _aRaise() {
        if (this._motion.raise(DoomPlayerWeapon.RAISESPEED)) {
            this._setState(this._weaponPsp, this._def().getEntry().ready);
        }
    }

    // The whole Heretic arsenal has no flash entry: a flash verb on a
    // flashless weapon is inert.
    _showFlash(flashKey) {
        if ((flashKey !== undefined) && (this._def().getState(flashKey) !== null)) {
            this._setState(this._flashPsp, flashKey);
        }
    }

    _aGunFlash() {
        this._showFlash(this._def().getEntry().flash);
    }

    _aMelee() {
        if (this._hitscan !== null) {
            this._hitscan.fireMelee(this._def(), this._user);
        }
    }

    _aFireHitscan(accurate) {
        this._useAmmo();
        this._showFlash(this._def().getEntry().flash);
        if (this._hitscan !== null) {
            this._hitscan.fire(this._def(), this._user, accurate);
        }
    }

    // Hitscan with an explicit flash frame (A_FireCGun: the chaingun's flash
    // mirrors the barrel state that fired). An ammo-less weapon always fires.
    _aFireHitscanFlash(flashKey) {
        const type = this._def().getAmmoType();
        if ((type !== null) && (this._user.getAmmo(type) <= 0)) {
            return;
        }
        this._useAmmo();
        this._showFlash(flashKey);
        if (this._hitscan !== null) {
            this._hitscan.fire(this._def(), this._user, this._accurateNow());
        }
    }

    _aFireProjectilesRandFlash() {
        this._showFlash((((this._rng.next() & 1) === 0) ? 'flash1' : 'flash2'));
        this._aFireProjectiles();
    }

    // A_FireMissile / A_FirePlasma / A_FireBFG all decrement the weapon's ammo
    // (the BFG's 40 cells via getPerShot) before spawning the shot(s) — one
    // spawn per def entry, a multi-entry def fires a fan (Heretic crossbow).
    // The ammo guard covers fire cycles with several firing states (Heretic
    // skullrod: the second state dry-runs when the last rune is gone, like
    // the ammo check opening every vanilla A_Fire*).
    _aFireProjectiles() {
        const type = this._def().getAmmoType();
        if ((type !== null) && (this._user.getAmmo(type) < this._def().getPerShot())) {
            return;
        }
        this._useAmmo();
        if (this._projectiles === null) {
            return;
        }
        for (const shot of this._def().getProjectiles()) {
            if ((shot.altKind !== undefined) && (this._rng.next() < shot.altChance)) {
                // Rare alternative shot (A_FireMacePL1: 28/256 throws the
                // lobbed MaceFX2) — straight along the aim, no spread.
                this._projectiles.spawn(shot.altKind, this._user, 0, 0);
                continue;
            }
            this._projectiles.spawn(shot.kind, this._user, shot.angleOffset ?? 0, shot.randomSpreadH ?? 0);
        }
    }

    // --- Weapon bring-up / ammo (P_BringUpWeapon / P_CheckAmmo) ---

    _bringUpWeapon() {
        this._pending = null;
        this._motion.dropToBottom();
        this._user.setActiveWeapon(this._ready);
        this._setState(this._weaponPsp, this._def().getEntry().up);
    }

    _fireWeapon() {
        if (!this._checkAmmo()) {
            return;
        }
        // P_FireWeapon wakes the neighbourhood (P_NoiseAlert) on every
        // initiated attack — fist and chainsaw included, vanilla.
        if (this._noiseCallback !== null) {
            this._noiseCallback();
        }
        // Recenter for the shot: the weapon stays steady through sustained fire
        // instead of freezing mid-bob.
        this._motion.recenter();
        // A refire re-enters the hold loop when the weapon has one (zscript
        // A_ReFire jumps to the Hold state — Heretic gauntlets/blaster/mace).
        const entry = this._def().getEntry();
        const start = (((this._refire > 0) && (entry.hold !== undefined)) ? entry.hold : entry.atk);
        this._setState(this._weaponPsp, start);
    }

    _checkAmmo() {
        const def  = this._def();
        const type = def.getAmmoType();
        if (type === null || this._user.getAmmo(type) >= def.getPerShot()) {
            return true;
        }
        this._pending = this._pickAmmoWeapon();
        this._setState(this._weaponPsp, def.getEntry().down);
        return false;
    }

    _useAmmo() {
        const type = this._def().getAmmoType();
        if (type !== null) {
            this._user.useAmmo(type, this._def().getPerShot());
        }
    }

    // Weapon-preference chain when the current weapon runs dry — the order and
    // ammo thresholds are game data (profile weaponFallbackOrder; the vanilla
    // Doom chain keeps its explicit > 2 shells / > 40 cells thresholds there).
    _pickAmmoWeapon() {
        const order = this._game.getGameProfile().weaponFallbackOrder();
        for (const entry of order) {
            if (!this._user.hasWeapon(entry.code)) {
                continue;
            }
            const def = this._game.getWeapon(entry.code);
            if (def === null) {
                continue;
            }
            const type = def.getAmmoType();
            if (type === null) {
                return entry.code;
            }
            const min = (entry.min ?? Math.max(def.getPerShot(), 1));
            if (this._user.getAmmo(type) >= min) {
                return entry.code;
            }
        }
        return order[order.length - 1].code;
    }
}

DoomPlayerWeapon.LOWERSPEED = 6;         // psprite raise/lower speed (units/tic)
DoomPlayerWeapon.RAISESPEED = 6;
DoomPlayerWeapon.MS_PER_TIC = 1000 / 35; // 35 tics per second
