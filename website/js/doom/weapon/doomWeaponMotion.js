/**
 * The weapon view-sprite's on-screen offset and its smoothing, split out of the
 * state machine. The shown offset (sx,sy) eases toward a target (tx,ty): the
 * state machine sets that target (bob while moving, centre on fire / at rest) or
 * drives the raise/lower directly. Vanilla snaps the bob straight onto sx/sy,
 * but its magnitude decays with the player's momentum (friction) so it drifts
 * back gently; our velocity is instantaneous, so we ease the offset instead.
 * The offset is simulation state: the raise reaching the top readies the
 * weapon (vanilla psp->sy). Drawing it is DoomWeaponOverlay's.
 */
class DoomWeaponMotion {
    constructor() {
        this._sx = 1;
        this._sy = DoomWeaponMotion.WEAPONTOP;
        this._tx = 1;
        this._ty = DoomWeaponMotion.WEAPONTOP;
    }

    // A_WeaponReady bob: player->bob = (momx^2 + momy^2) >> 2, capped at MAXBOB,
    // in 320-base pixels; our speed is world units/s → Doom map units/tic (/64).
    bobTarget(ticks, speedWorld) {
        const mom = speedWorld * 64 / 35;
        const bob = Math.min(DoomWeaponMotion.MAXBOB, (mom * mom) / 4);
        const ang = (128 * ticks) % DoomWeaponMotion.FINEANGLES;
        this._tx = 1 + bob * Math.cos(ang / DoomWeaponMotion.FINEANGLES * 2 * Math.PI);
        const angY = ang % (DoomWeaponMotion.FINEANGLES / 2);
        this._ty = DoomWeaponMotion.WEAPONTOP + bob * Math.sin(angY / DoomWeaponMotion.FINEANGLES * 2 * Math.PI);
    }

    // Firing / at rest: aim the offset at centre.
    recenter() {
        this._tx = 1;
        this._ty = DoomWeaponMotion.WEAPONTOP;
    }

    // A_Lower: move the weapon down; returns true once fully lowered.
    lower(speed) {
        this._sy += speed;
        this._tx = 1;
        this._ty = this._sy;
        return (this._sy >= DoomWeaponMotion.WEAPONBOTTOM);
    }

    // A_Raise: move the weapon up; returns true once fully raised (clamped top).
    raise(speed) {
        this._sy -= speed;
        this._tx = 1;
        this._ty = this._sy;
        if (this._sy > DoomWeaponMotion.WEAPONTOP) {
            return false;
        }
        this._sy = DoomWeaponMotion.WEAPONTOP;
        this._ty = DoomWeaponMotion.WEAPONTOP;
        return true;
    }

    // P_BringUpWeapon: start centred at the bottom of the screen.
    dropToBottom() {
        this._sx = 1;
        this._sy = DoomWeaponMotion.WEAPONBOTTOM;
        this._tx = 1;
        this._ty = DoomWeaponMotion.WEAPONBOTTOM;
    }

    ease() {
        const k = DoomWeaponMotion.EASE;
        this._sx += (this._tx - this._sx) * k;
        this._sy += (this._ty - this._sy) * k;
    }

    // Shown offset, in the 320x200 reference screen.
    getOffsetX() {
        return this._sx;
    }

    getOffsetY() {
        return this._sy;
    }
}

DoomWeaponMotion.WEAPONTOP    = 32;
DoomWeaponMotion.WEAPONBOTTOM = 128;
DoomWeaponMotion.MAXBOB       = 16;
DoomWeaponMotion.FINEANGLES   = 8192;
DoomWeaponMotion.EASE         = 0.28;  // per-tic easing of the shown offset toward its target
