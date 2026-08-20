/**
 * Per-level sector pushes (Heretic wind 40-51, conveyor floors 20-39 + the
 * scrolling lava 4) and low-friction ground (ice, 15). Every frame the
 * player's zone feeds the generic ActorExternalForces channel consumed by
 * User.updateMove — forces are frame-scoped, so leaving the zone simply
 * stops feeding them.
 *
 * Semantics (UZDoom p_mobj.cpp / specials.cpp, transcribed):
 *  - wind: per-tic thrust, applies on the ground AND in the air (XZ test only);
 *  - carry: terminal speed, feet on the sector floor only;
 *  - friction: ground slipperiness, feet on the sector floor only.
 * The same zones feed the player AND every monster record (BOOM/MBF style —
 * user decision: monsters and corpses take the environmental physics; each
 * record carries its own ActorExternalForces channel).
 */
class DoomSectorPushInteraction extends AbstractInteraction {
    /**
     * @param {DoomSectorZones}   zones    [{si, floorY (world), push: {kind, dx, dz}|null,
     *                                     friction: {friction}|null}] behind the shared locator
     * @param {DoomMonsterSystem} monsters
     */
    constructor(zones, monsters = null) {
        super();
        this._zones    = zones;
        this._monsters = monsters;
    }

    get code() {
        return 'sectorPush';
    }

    triggered(instance) {
    }

    update(dt) {
        // A dead player keeps being pushed (GZDoom: the carry/wind live at
        // mobj level and the corpse keeps its player link — it drifts on the
        // river; vanilla Heretic would freeze it with the player think).
        const user = loader.world().get().getUser();
        const forces = user.getExternalForces();
        const doomX  = user.x / WadConstants.SCALE;
        const doomZ  = user.z / WadConstants.SCALE;
        // map units per tic → metres per second
        const toMs   = WadConstants.SCALE / WadConstants.SECONDS_PER_TIC;
        this._zones.eachZoneAt(doomX, doomZ, (zone) => {
            const height = user.y - zone.floorY;
            // Carry tolerance above the sector floor: straddling a ledge, the
            // collision cylinder props the player on the lip of the previous
            // (higher) floor while the centre already sits in the carry sector
            // — feet up to stepHeight above still get grabbed (the current
            // pulls them down onto it). Vanilla's strict feet==floor test
            // never meets this case at its original carry speeds; at the
            // modern slow east speeds the residual glide (~0.16 m) is shorter
            // than the straddle band (0.25 m) and stranded the player there.
            const carried = (user.isOnGround() === true)
                && (height >= -WadConstants.ON_FLOOR_TOLERANCE) && (height <= user.getStepHeight());
            this._applyForces(zone, forces, height, carried, toMs);
        });

        if (this._monsters !== null) {
            this._feedMonsters(toMs);
        }
    }

    // Same rules for every monster record, corpses included (they drift):
    // wind at any height, carry and friction with the feet on the sector
    // floor (straddle band like the player, boxes prop bodies on lips too).
    _feedMonsters(toMs) {
        for (const m of this._monsters.getMonsters()) {
            const pos = m.inst.getTransform().position;
            this._zones.eachZoneAt(pos[0] / WadConstants.SCALE, pos[2] / WadConstants.SCALE, (zone) => {
                const height   = pos[1] - zone.floorY;
                const grounded = ((height >= -WadConstants.ON_FLOOR_TOLERANCE)
                    && (height <= WadConstants.ACTOR_STEP_HEIGHT));
                this._applyForces(zone, m.env, height, grounded, toMs);
            });
        }
    }

    // Shared wind/carry/friction dispatch — the caller decides the carry
    // eligibility (player straddle band vs monster step band), the on-floor
    // friction gate is common.
    _applyForces(zone, env, height, carried, toMs) {
        if (zone.push !== null) {
            if (zone.push.kind === 'wind') {
                env.addThrust(zone.push.dx * toMs, zone.push.dz * toMs);
            } else if (carried) {
                env.addCarry(zone.push.dx * toMs, zone.push.dz * toMs);
            }
        }
        if ((zone.friction !== null) && (Math.abs(height) <= WadConstants.ON_FLOOR_TOLERANCE)) {
            env.setGroundFriction(zone.friction.friction);
        }
    }
}
