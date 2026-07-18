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

        this._ready      = user.getActiveWeapon();
        this._pending    = null;
        this._refire     = 0;
        this._attackDown = false;
        this._fireHeld   = false;
        this._extraLight = 0;
        this._light      = 1;

        this._ticks = 0;
        this._acc   = 0;

        this._bringUpWeapon();
    }

    setAttackSystems(hitscan, projectiles) {
        this._hitscan     = hitscan;
        this._projectiles = projectiles;
        return this;
    }

    // Sector-light factor (0..1) applied to the non-fullbright weapon sprite.
    setLight(light) {
        this._light = light;
    }

    getExtraLight() {
        return this._extraLight;
    }

    // --- Frame update ---

    update(dtMs, fireHeld) {
        this._fireHeld = fireHeld;
        this._acc += dtMs;
        while (this._acc >= DoomPlayerWeapon.MS_PER_TIC) {
            this._acc  -= DoomPlayerWeapon.MS_PER_TIC;
            this._ticks += 1;
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
        const rect = this._motion.screenRect(spr);
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
                if (psp === this._flashPsp) {
                    this._extraLight = 0;
                }
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

    _runAction(name, psp) {
        switch (name) {
            case 'ready':         this._aWeaponReady();       break;
            case 'lower':         this._aLower();             break;
            case 'raise':         this._aRaise();             break;
            case 'refire':        this._aReFire();            break;
            case 'gunFlash':      this._aGunFlash();          break;
            case 'checkReload':   this._checkAmmo();          break;
            case 'light1':        this._extraLight = 1;       break;
            case 'light2':        this._extraLight = 2;       break;
            case 'punch':
            case 'saw':           this._aMelee();             break;
            case 'firePistol':    this._aFireHitscan(!this._refire); break;
            case 'fireShotgun':
            case 'fireShotgun2':  this._aFireHitscan(false);  break;
            case 'fireCGun1':     this._aFireCGun('flash1');  break;
            case 'fireCGun2':     this._aFireCGun('flash2');  break;
            case 'fireMissile':
            case 'fireBFG':       this._aFireProjectile();    break;
            case 'firePlasma':    this._aFirePlasma();        break;
            // Sound-only in vanilla (no audio yet); the state timing is kept.
            case 'bfgSound':
            case 'openShotgun2':
            case 'loadShotgun2':
            case 'closeShotgun2':
            default:              break;
        }
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

    _aGunFlash() {
        this._setState(this._flashPsp, this._def().getEntry().flash);
    }

    _aMelee() {
        if (this._hitscan !== null) {
            this._hitscan.fireMelee(this._def(), this._user);
        }
    }

    _aFireHitscan(accurate) {
        this._useAmmo();
        this._setState(this._flashPsp, this._def().getEntry().flash);
        if (this._hitscan !== null) {
            this._hitscan.fire(this._def(), this._user, accurate);
        }
    }

    _aFireCGun(flashKey) {
        const type = this._def().getAmmoType();
        if (this._user.getAmmo(type) <= 0) {
            return;
        }
        this._useAmmo();
        this._setState(this._flashPsp, flashKey);
        if (this._hitscan !== null) {
            this._hitscan.fire(this._def(), this._user, !this._refire);
        }
    }

    _aFirePlasma() {
        this._useAmmo();
        this._setState(this._flashPsp, (((this._rng.next() & 1) === 0) ? 'flash1' : 'flash2'));
        this._aFireProjectile();
    }

    _aFireProjectile() {
        if (this._projectiles !== null) {
            this._projectiles.spawn(this._def().getProjectile(), this._user);
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
        // Recenter for the shot: the weapon stays steady through sustained fire
        // instead of freezing mid-bob.
        this._motion.recenter();
        this._setState(this._weaponPsp, this._def().getEntry().atk);
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

    // Vanilla weapon-preference chain when the current weapon runs dry.
    _pickAmmoWeapon() {
        const u = this._user;
        if (u.hasWeapon('plasma') && u.getAmmo('cells') > 0) {
            return 'plasma';
        }
        if (u.hasWeapon('supershotgun') && u.getAmmo('shells') > 2) {
            return 'supershotgun';
        }
        if (u.hasWeapon('chaingun') && u.getAmmo('bullets') > 0) {
            return 'chaingun';
        }
        if (u.hasWeapon('shotgun') && u.getAmmo('shells') > 0) {
            return 'shotgun';
        }
        if (u.hasWeapon('pistol') && u.getAmmo('bullets') > 0) {
            return 'pistol';
        }
        if (u.hasWeapon('chainsaw')) {
            return 'chainsaw';
        }
        if (u.hasWeapon('rocket') && u.getAmmo('rockets') > 0) {
            return 'rocket';
        }
        if (u.hasWeapon('bfg') && u.getAmmo('cells') > 40) {
            return 'bfg';
        }
        return 'fist';
    }
}

DoomPlayerWeapon.LOWERSPEED = 6;         // psprite raise/lower speed (units/tic)
DoomPlayerWeapon.RAISESPEED = 6;
DoomPlayerWeapon.MS_PER_TIC = 1000 / 35; // 35 tics per second
