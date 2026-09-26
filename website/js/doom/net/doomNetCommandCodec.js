/**
 * A player's command for one turn to and from its binary message: the turn it
 * answers, the movement axes and look angles (Float32), the buttons as a
 * bitmask and the impulses (Float32, small signed counts), both in the order
 * the game declares them to its command sampler. Fail-fast like the state
 * codec.
 */
class DoomNetCommandCodec {
    /**
     * @param {string[]} buttons  - every button name, in a fixed order (16 at most)
     * @param {string[]} impulses - every impulse name, in a fixed order
     */
    constructor(buttons, impulses) {
        if (buttons.length > DoomNetCommandCodec.MAX_BUTTONS) {
            throw new RangeError('More buttons than the command bitmask holds');
        }
        this._buttons  = buttons;
        this._impulses = impulses;
    }

    /**
     * @param {int}         turn
     * @param {UserCommand} command
     * @returns {ArrayBuffer}
     */
    encode(turn, command) {
        let mask = 0;
        this._buttons.forEach((button, bit) => {
            if (command.isPressed(button)) {
                mask |= (1 << bit);
            }
        });
        const w = new NetByteWriter().u8(DoomNetProtocol.MESSAGE_COMMAND).u32(turn)
            .f32(command.getMoveX()).f32(command.getMoveY()).f32(command.getLookYaw()).f32(command.getLookPitch()).u16(mask);
        for (const impulse of this._impulses) {
            w.f32(command.getImpulse(impulse));
        }

        return w.toBytes().buffer;
    }

    /**
     * @param {ArrayBuffer} buffer
     * @returns {{turn: int, command: UserCommand}}
     * @throws {NetError} INVALID_MESSAGE, or a RangeError read past the end
     */
    decode(buffer) {
        const r = new NetByteReader(buffer);
        if (r.u8() !== DoomNetProtocol.MESSAGE_COMMAND) {
            throw new NetError(NetError.INVALID_MESSAGE, 'Not a command message');
        }
        const turn    = r.u32();
        const command = new UserCommand().setMove(r.f32(), r.f32()).setLook(r.f32(), r.f32());
        const mask    = r.u16();
        this._buttons.forEach((button, bit) => {
            if ((mask & (1 << bit)) !== 0) {
                command.press(button);
            }
        });
        for (const impulse of this._impulses) {
            command.setImpulse(impulse, r.f32());
        }
        if (!r.isAtEnd()) {
            throw new NetError(NetError.INVALID_MESSAGE, 'Command message longer than its content');
        }

        return {turn: turn, command: command};
    }
}

DoomNetCommandCodec.MAX_BUTTONS = 16;
