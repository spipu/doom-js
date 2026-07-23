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
     * @param {object[]}          zones    [{si, outers (doom-coord polygons), floorY (world),
     *                                     push: {kind, dx, dz}|null, friction: {friction}|null}]
     * @param {DoomMonsterSystem} monsters
     */
    constructor(zones, monsters = null) {
        super();
        this._zones    = zones;
        this._monsters = monsters;
        // Cheap AABB of every zone (doom coords): the per-frame monster sweep
        // rejects far bodies before any point-in-polygon test.
        for (const zone of this._zones) {
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const outer of zone.outers) {
                for (const pt of outer) {
                    minX = Math.min(minX, pt[0]);
                    minY = Math.min(minY, pt[1]);
                    maxX = Math.max(maxX, pt[0]);
                    maxY = Math.max(maxY, pt[1]);
                }
            }
            zone.bbox = [minX, minY, maxX, maxY];
        }
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

        if (this._monsters !== null) {
            this._feedMonsters(toMs);
        }
    }

    // Same rules for every monster record, corpses included (they drift):
    // wind at any height, carry and friction with the feet on the sector
    // floor (straddle band like the player, boxes prop bodies on lips too).
    _feedMonsters(toMs) {
        const step = WadConstants.ACTOR_STEP_HEIGHT;
        for (const m of this._monsters.getMonsters()) {
            const pos   = m.inst.getTransform().position;
            const doomX = pos[0] / WadConstants.SCALE;
            const doomZ = pos[2] / WadConstants.SCALE;
            for (const zone of this._zones) {
                if ((doomX < zone.bbox[0]) || (doomX > zone.bbox[2]) || (doomZ < zone.bbox[1]) || (doomZ > zone.bbox[3])) {
                    continue;
                }
                if (!this._inZone(zone, doomX, doomZ)) {
                    continue;
                }
                const height  = pos[1] - zone.floorY;
                const grounded = ((height >= -0.02) && (height <= step));
                if (zone.push !== null) {
                    if (zone.push.kind === 'wind') {
                        m.env.addThrust(zone.push.dx * toMs, zone.push.dz * toMs);
                    } else if (grounded) {
                        m.env.addCarry(zone.push.dx * toMs, zone.push.dz * toMs);
                    }
                }
                if ((zone.friction !== null) && (Math.abs(height) <= 0.02)) {
                    m.env.setGroundFriction(zone.friction.friction);
                }
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
