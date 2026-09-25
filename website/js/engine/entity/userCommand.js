/**
 * What one player asks of the simulation for one turn — plain data, the only
 * boundary between the control devices and the simulation: no key code,
 * pointer, button index, stick axis nor device setting ever crosses it.
 *
 *   - movement axes, -1..+1 (+X = strafe right, +Y = forward)
 *   - look angles, in degrees, already converted on the device that sampled them
 *   - named buttons, pressed or not (the engine's below, a game adds its own)
 *   - impulse counters (discrete steps, such as a weapon wheel)
 *
 * Button edges are never stored here: whoever consumes a command derives
 * them from the same player's previous one.
 */
class UserCommand {
    constructor() {
        this._moveX     = 0;
        this._moveY     = 0;
        this._lookYaw   = 0;
        this._lookPitch = 0;
        this._buttons   = new Set();
        // Prototype-less: the names come from the game.
        this._impulses  = Object.create(null);
    }

    setMove(x, y) {
        this._moveX = x;
        this._moveY = y;

        return this;
    }

    // Degrees: yaw turns right, pitch looks up.
    setLook(yaw, pitch) {
        this._lookYaw   = yaw;
        this._lookPitch = pitch;

        return this;
    }

    press(button) {
        this._buttons.add(button);

        return this;
    }

    setImpulse(name, count) {
        this._impulses[name] = count;

        return this;
    }

    getMoveX() {
        return this._moveX;
    }

    getMoveY() {
        return this._moveY;
    }

    getLookYaw() {
        return this._lookYaw;
    }

    getLookPitch() {
        return this._lookPitch;
    }

    isPressed(button) {
        return this._buttons.has(button);
    }

    /**
     * @param {string}           button
     * @param {UserCommand|null} previous - the same player's previous command
     * @returns {boolean} pressed now, not in the previous command
     */
    isJustPressed(button, previous) {
        return (this.isPressed(button) && !UserCommand._pressedIn(previous, button));
    }

    /**
     * @param {string}           button
     * @param {UserCommand|null} previous - the same player's previous command
     * @returns {boolean} released now, pressed in the previous command
     */
    isJustReleased(button, previous) {
        return (!this.isPressed(button) && UserCommand._pressedIn(previous, button));
    }

    getImpulse(name) {
        return (this._impulses[name] ?? 0);
    }

    static _pressedIn(command, button) {
        return ((command !== null) && command.isPressed(button));
    }
}

UserCommand.JUMP      = 'jump';
UserCommand.CROUCH    = 'crouch';
UserCommand.WALK_SLOW = 'walkSlow';
UserCommand.ACTION    = 'action';
