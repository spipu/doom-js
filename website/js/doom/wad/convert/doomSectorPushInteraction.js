/**
 * Per-level sector pushes (Heretic wind 40-51, conveyor floors 20-39 + the
 * scrolling lava 4) and low-friction ground (ice, 15). Every frame the
 * player's zone feeds the generic UserExternalForces channel consumed by
 * User.updateMove — forces are frame-scoped, so leaving the zone simply
 * stops feeding them.
 *
 * Semantics (UZDoom p_mobj.cpp / specials.cpp, transcribed):
 *  - wind: per-tic thrust, applies on the ground AND in the air (XZ test only);
 *  - carry: terminal speed, feet on the sector floor only;
 *  - friction: ground slipperiness, feet on the sector floor only.
 * Player only, like vanilla (sector carry is player-gated, wind pushes
 * WINDTHRUST actors — we have no enemies).
 */
class DoomSectorPushInteraction extends AbstractInteraction {
    /**
     * @param {object[]} zones - [{si, outers (doom-coord polygons), floorY (world),
     *                            push: {kind, dx, dz}|null, friction: {friction}|null}]
     */
    constructor(zones) {
        super();
        this._zones = zones;
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
        for (const zone of this._zones) {
            if (!this._inZone(zone, doomX, doomZ)) {
                continue;
            }
            const height = user.y - zone.floorY;
            const onFloor = (Math.abs(height) <= 0.02);
            // Carry tolerance above the sector floor: straddling a ledge, the
            // collision cylinder props the player on the lip of the previous
            // (higher) floor while the centre already sits in the carry sector
            // — feet up to stepHeight above still get grabbed (the current
            // pulls them down onto it). Vanilla's strict feet==floor test
            // never meets this case at its original carry speeds; at the
            // modern slow east speeds the residual glide (~0.16 m) is shorter
            // than the straddle band (0.25 m) and stranded the player there.
            const carried = (user.isOnGround() === true)
                && (height >= -0.02) && (height <= user.getStepHeight());
            if (zone.push !== null) {
                if (zone.push.kind === 'wind') {
                    forces.addThrust(zone.push.dx * toMs, zone.push.dz * toMs);
                } else if (carried) {
                    forces.addCarry(zone.push.dx * toMs, zone.push.dz * toMs);
                }
            }
            if ((zone.friction !== null) && onFloor) {
                forces.setGroundFriction(zone.friction.friction);
            }
        }
    }

    _inZone(zone, doomX, doomZ) {
        for (const outer of zone.outers) {
            if (WadGeometry.pointInPolygon2d(doomX, doomZ, outer)) {
                return true;
            }
        }

        return false;
    }
}
