/**
 * The player's ear: position + facing of the bound user turned into the gain
 * and stereo pan of a world sound — the attenuation model of the game, which
 * the engine player deliberately ignores.
 *
 * Gain follows the UZDoom rolloff (s_sound.cpp SoundEngine::GetRolloff):
 * Doom's default curve ($rolloff * 200 1200, base sndinfo.txt:51) is linear in
 * distance mapped on a log volume scale — gain = (10^v − 1) / 9 — while Raven
 * games look the volume up in the SNDCURVE lump of their own WAD ($rolloff *
 * custom 0 1600; the lump size IS the max distance). Distances are measured in
 * 3D, in map units; the ATTN factor multiplies the distance (0 = full volume
 * everywhere, centred).
 *
 * Pan is the horizontal angle of the source relative to the look direction:
 * sin(sourceAngle − yaw), the equal-power equivalent of what OpenAL renders to
 * stereo for UZDoom.
 */
class DoomSoundListener {
    constructor() {
        this._user    = null;
        this._rolloff = null;
    }

    /**
     * @param {User} user the level's player — rebound on every level
     */
    setUser(user) {
        this._user = user;
        return this;
    }

    clearUser() {
        this._user = null;
        return this;
    }

    /**
     * @param {{type: string, min: number, max: number, curve: Uint8Array|null}} rolloff
     */
    setRolloff(rolloff) {
        this._rolloff = rolloff;
        return this;
    }

    /**
     * @param {number[]|null} origin world position [x, y, z] (engine metres)
     * @param {number} attenuation distance multiplier (0 = full volume, centred)
     * @returns {{gain: number, pan: number}}
     */
    paramsFor(origin, attenuation) {
        if ((origin === null) || (attenuation === 0) || (this._user === null)) {
            return {gain: 1, pan: 0};
        }
        const dx = (origin[0] - this._user.x);
        const dy = (origin[1] - this._user.y);
        const dz = (origin[2] - this._user.z);
        const distance = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
        const gain = this._gainFor((distance / WadConstants.SCALE) * attenuation);

        // Pan = the source direction projected on the player's RIGHT vector
        // (cos(yaw), -sin(yaw)) — equals sin(sourceAngle − yaw).
        const flat = Math.sqrt((dx * dx) + (dz * dz));
        let pan = 0;
        if (flat > DoomSoundListener.PAN_MIN_DISTANCE) {
            const yawRad = (DEG_TO_RAD * this._user.yaw);
            pan = ((dx * Math.cos(yawRad)) - (dz * Math.sin(yawRad))) / flat;
        }

        return {gain: gain, pan: pan};
    }

    /**
     * Random pitch of one start — CalcPitch (s_sound.cpp:368):
     * (128 − (rnd & mask) + (rnd & mask)) / 128, mask = (1 << range) − 1.
     * Range 0 keeps the pitch fixed. Deviation: Math.random stands in for the
     * dedicated pr_soundpitch stream (same liberty as the sector lights).
     *
     * @param {number} range $pitchshift range, clamped 0..7
     * @returns {number} playbackRate factor
     */
    static pitchFor(range) {
        const clamped = Math.min(Math.max(range, 0), 7);
        const mask = ((1 << clamped) - 1);
        if (mask === 0) {
            return 1;
        }
        const down = (Math.floor(Math.random() * 256) & mask);
        const up   = (Math.floor(Math.random() * 256) & mask);

        return ((128 - down + up) / 128);
    }

    // Distance in map units, already multiplied by the ATTN factor.
    _gainFor(distance) {
        const rolloff = this._rolloff;
        if (rolloff === null) {
            return 1;
        }
        if (distance <= rolloff.min) {
            return 1;
        }
        if (distance >= rolloff.max) {
            return 0;
        }
        const volume = ((rolloff.max - distance) / (rolloff.max - rolloff.min));
        if ((rolloff.type === 'sndcurve') && ((rolloff.curve ?? null) !== null)) {
            const index = Math.min(rolloff.curve.length - 1, Math.floor(rolloff.curve.length * (1 - volume)));
            return (rolloff.curve[index] / 127);
        }

        return ((Math.pow(10, volume) - 1) / 9);
    }
}

// Under this flat distance (metres) the source is on top of the listener:
// no meaningful direction, the pan stays centred.
DoomSoundListener.PAN_MIN_DISTANCE = 0.01;
