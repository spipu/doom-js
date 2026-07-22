/**
 * One immutable monster state, mirroring the weapon psprite states
 * (DoomWeaponState) but without the fixed rotation-0 suffix: a monster frame
 * is rendered through its 8-rotation set, so the state only carries the
 * sprite prefix + frame letter and the consumer resolves the rotation lump.
 */
class DoomMonsterState {
    constructor(sprite, frame, tics, action, next, bright, fast) {
        this._sprite = sprite;
        this._frame  = frame;
        this._tics   = tics;
        this._action = action;
        this._next   = next;
        this._bright = bright;
        this._fast   = fast;
    }

    getSprite() {
        return this._sprite;
    }

    getFrame() {
        return this._frame;
    }

    getTics() {
        return this._tics;
    }

    getAction() {
        return this._action;
    }

    getNext() {
        return this._next;
    }

    isBright() {
        return this._bright;
    }

    // "Fast" zscript state keyword: the tics are halved when the skill rules
    // enable fast monsters (demon chase/attack states).
    isFast() {
        return this._fast;
    }
}
