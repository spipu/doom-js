/**
 * The weapon view-sprite's on-screen offset and its smoothing, split out of the
 * state machine. The shown offset (sx,sy) eases toward a target (tx,ty): the
 * state machine sets that target (bob while moving, centre on fire / at rest) or
 * drives the raise/lower directly. Vanilla snaps the bob straight onto sx/sy,
 * but its magnitude decays with the player's momentum (friction) so it drifts
 * back gently; our velocity is instantaneous, so we ease the offset instead.
 * Placement follows Doom's R_DrawPSprite in a 320x200 base (left = sx -
 * leftOffset, top = sy - topOffset), normalised to 0..1 screen space.
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

    // Normalised 0..1 screen rect for a sprite {width, height, leftOffset,
    // topOffset}. yAdjust = per-weapon vertical offset (gzdoom Weapon.YAdjust,
    // 320x200 pixels, positive = down — Heretic draws its weapons lower).
    screenRect(spr, yAdjust = 0) {
        const left = this._sx - spr.leftOffset;
        const top  = (this._sy + yAdjust) - spr.topOffset;
        return {
            x: left / DoomWeaponMotion.BASE_W,
            y: top / DoomWeaponMotion.BASE_H,
            w: spr.width / DoomWeaponMotion.BASE_W,
            h: spr.height / DoomWeaponMotion.BASE_H,
        };
    }
}

DoomWeaponMotion.WEAPONTOP    = 32;
DoomWeaponMotion.WEAPONBOTTOM = 128;
DoomWeaponMotion.MAXBOB       = 16;
DoomWeaponMotion.FINEANGLES   = 8192;
DoomWeaponMotion.BASE_W       = 320;   // psprite reference screen (Doom SCREENWIDTH / height)
DoomWeaponMotion.BASE_H       = 200;
DoomWeaponMotion.EASE         = 0.28;  // per-tic easing of the shown offset toward its target
