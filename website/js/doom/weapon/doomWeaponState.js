/**
 * One psprite animation frame (mirror of a states[] entry in info.c): which
 * sprite lump to show, how long, which action to run, and where to go next.
 */
class DoomWeaponState {
    constructor(sprite, frame, tics, action, next, bright) {
        this._sprite = sprite;
        this._frame  = frame;
        this._tics   = tics;
        this._action = action;
        this._next   = next;
        this._bright = (bright === true);
    }

    getLump() {
        return this._sprite + this._frame + '0';
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
}
