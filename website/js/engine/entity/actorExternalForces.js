/**
 * Environment forces on one actor (wind, conveyors, slippery ground). Game code
 * re-asserts them every frame before the owner's physics step consumes them,
 * so leaving the area simply stops feeding them.
 *
 * The horizontal push is an environment velocity integrated at a fixed tick
 * rate: each tick `vel = vel * DECAY + thrust`. A constant thrust therefore
 * converges to `thrust / (1 - DECAY)`; addCarry feeds `target * (1 - DECAY)`
 * so the terminal speed is exactly `target` (BOOM carry mechanics, where
 * CARRYFACTOR = 1 - DECAY = 3/32).
 */
class ActorExternalForces {
    constructor() {
        // Environment velocity (m/s), persists between frames (momentum)
        this._velX = 0;
        this._velZ = 0;
        // Per-tick thrusts fed this frame (m/s per tick), reset each frame
        this._thrustX = 0;
        this._thrustZ = 0;
        // Ground slipperiness for this frame (null = full grip), reset each frame
        this._groundFriction = null;
    }

    // --- Game-facing API (call every frame while the actor is affected) ---

    // Thrust in m/s added to the environment velocity at each simulation tick
    // (wind: pushes on the ground and in the air alike).
    addThrust(x, z) {
        this._thrustX += x;
        this._thrustZ += z;
    }

    // Terminal speed in m/s the environment carries the actor toward
    // (conveyor floor: the caller only applies it while the actor stands on it).
    addCarry(x, z) {
        this._thrustX += x * (1 - ActorExternalForces.DECAY);
        this._thrustZ += z * (1 - ActorExternalForces.DECAY);
    }

    // Per-tick momentum keep factor of the ground for this frame — the owner
    // switches its ground control to an inertial model (ice) when set.
    setGroundFriction(factor) {
        this._groundFriction = factor;
    }

    getGroundFriction() {
        return this._groundFriction;
    }

    // --- Owner-facing hooks ---

    beginFrame() {
        this._thrustX        = 0;
        this._thrustZ        = 0;
        this._groundFriction = null;
    }

    // One-shot kick in m/s (a blow, a blast): goes straight into the momentum,
    // since the thrust accumulator is cleared every frame.
    addImpulse(x, z) {
        this._velX += x;
        this._velZ += z;
    }

    // Closed form of the per-tick recurrence, exact for any frame duration
    integrate(dtS) {
        const keep = Math.pow(ActorExternalForces.DECAY, dtS * ActorExternalForces.TICK_RATE);
        const termX = this._thrustX / (1 - ActorExternalForces.DECAY);
        const termZ = this._thrustZ / (1 - ActorExternalForces.DECAY);
        this._velX = this._velX * keep + termX * (1 - keep);
        this._velZ = this._velZ * keep + termZ * (1 - keep);
        if ((this._thrustX === 0) && (Math.abs(this._velX) < 1e-6)) {
            this._velX = 0;
        }
        if ((this._thrustZ === 0) && (Math.abs(this._velZ) < 1e-6)) {
            this._velZ = 0;
        }
    }

    getVelX() {
        return this._velX;
    }

    getVelZ() {
        return this._velZ;
    }
}

// Simulation tick rate of the perturbation channel (Hz)
ActorExternalForces.TICK_RATE = 35;
// Per-tick momentum keep factor of the push channel (BOOM ORIG_FRICTION)
ActorExternalForces.DECAY = 0.90625;
