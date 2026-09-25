/**
 * The only reader of the input devices on behalf of the simulation: it
 * collects every frame and produces one UserCommand when the caller asks for
 * a turn's command.
 *
 * Between two commands, the look deltas add up (converted from
 * pixel-equivalents to degrees here, with the device's own sensitivity), the
 * impulses add up, and a button counts as pressed if it was down on any
 * collected frame — a tap shorter than a turn is never lost, and the next
 * command shows it released. The movement axes are read when the command is
 * produced. A game declares its own buttons and impulses beside the engine's.
 */
class InputCommandSampler {
    // Degrees per pixel-equivalent: a mouse moved by 10 px turns by 1°, a
    // stick at full tilt (1.2 px/ms, see Inputs) by 120°/s.
    static get DEFAULT_TURN_SPEED() {
        return 0.1;
    }

    /**
     * @param {Inputs} inputs
     */
    constructor(inputs) {
        this._inputs         = inputs;
        this._turnSpeed      = InputCommandSampler.DEFAULT_TURN_SPEED;
        this._buttonReaders  = new Map([
            [UserCommand.JUMP, () => inputs.readButtonJump()],
            [UserCommand.CROUCH, () => inputs.readButtonCrouch()],
            [UserCommand.WALK_SLOW, () => inputs.readButtonWalkSlow()],
            [UserCommand.ACTION, () => inputs.readButtonAction()]
        ]);
        this._impulseReaders = new Map();
        this._lookYaw        = 0;
        this._lookPitch      = 0;
        this._pressed        = new Set();
        this._impulses       = new Map();
    }

    setTurnSpeed(degreesPerPixel) {
        this._turnSpeed = degreesPerPixel;

        return this;
    }

    /**
     * @param {string}              name
     * @param {function(): boolean} reader - whether the button is down now
     */
    addButton(name, reader) {
        this._buttonReaders.set(name, reader);

        return this;
    }

    /**
     * @param {string}             name
     * @param {function(): number} reader - the discrete steps since its last read (consumed)
     */
    addImpulse(name, reader) {
        this._impulseReaders.set(name, reader);

        return this;
    }

    /**
     * Reads the devices once; call it on every frame the simulation runs.
     *
     * @param {number} dt - milliseconds since the previous frame (stick look speed)
     */
    collect(dt) {
        this._lookYaw   += this._inputs.readJoy2DeltaX(dt) * this._turnSpeed;
        this._lookPitch -= this._inputs.readJoy2DeltaY(dt) * this._turnSpeed;
        for (const [name, reader] of this._buttonReaders) {
            if (reader()) {
                this._pressed.add(name);
            }
        }
        for (const [name, reader] of this._impulseReaders) {
            this._impulses.set(name, (this._impulses.get(name) ?? 0) + reader());
        }

        return this;
    }

    /**
     * @returns {UserCommand} what was collected since the previous command, which starts afresh
     */
    sample() {
        const command = new UserCommand()
            .setMove(this._inputs.readJoy1X(), this._inputs.readJoy1Y())
            .setLook(this._lookYaw, this._lookPitch);
        for (const name of this._pressed) {
            command.press(name);
        }
        for (const [name, count] of this._impulses) {
            command.setImpulse(name, count);
        }
        this._lookYaw   = 0;
        this._lookPitch = 0;
        this._pressed.clear();
        this._impulses.clear();

        return command;
    }
}
