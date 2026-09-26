/**
 * Per-level sector pushes (Heretic wind 40-51, conveyor floors 20-39 + the
 * scrolling lava 4) and low-friction ground (ice, 15). Every frame each
 * player's zone feeds the generic ActorExternalForces channel consumed by
 * User.updateMove — forces are frame-scoped, so leaving the zone simply
 * stops feeding them.
 *
 * Semantics (UZDoom p_mobj.cpp / specials.cpp, transcribed):
 *  - wind: per-tic thrust, applies on the ground AND in the air (XZ test only);
 *  - carry: terminal speed, feet on the sector floor only;
 *  - friction: ground slipperiness, feet on the sector floor only.
 * The same zones feed the players AND every monster record, corpses included
 * (BOOM/MBF style), each through its own ActorExternalForces channel.
 */
class DoomSectorPushInteraction extends AbstractInteraction {
    /**
     * @param {DoomSectorZones}   zones    [{si, push: {kind, dx, dz}|null,
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
        const toMetresPerS = WadConstants.SCALE / WadConstants.SECONDS_PER_TIC;
        for (const user of loader.world().get().getUsers()) {
            this._feedUser(user, toMetresPerS);
        }

        if (this._monsters !== null) {
            this._feedMonsters(toMetresPerS);
        }
    }

    // A dead player keeps being pushed (GZDoom: the carry/wind live at mobj
    // level and the corpse keeps its player link — it drifts on the river;
    // vanilla Heretic would freeze it with the player think).
    _feedUser(user, toMetresPerS) {
        const forces = user.getExternalForces();
        this._zones.eachZoneAt(user.x, user.z, (zone) => {
            const height = user.y - this._zones.floorYOf(zone);
            // Feet up to stepHeight above the floor still get carried: straddling
            // a ledge, the cylinder rests on the higher lip while the centre is in.
            const carried = ((user.isOnGround() === true)
                && (height >= -WadConstants.ON_FLOOR_TOLERANCE) && (height <= user.getStepHeight()));
            this._applyForces(zone, forces, height, carried, toMetresPerS);
        });
    }

    // Monsters get the player's straddle band too (boxes prop bodies on lips).
    // One callback for the whole sweep: the current monster rides the locals.
    _feedMonsters(toMetresPerS) {
        let pos = null;
        let env = null;
        const applyToMonster = (zone) => {
            const height   = pos[1] - this._zones.floorYOf(zone);
            const grounded = ((height >= -WadConstants.ON_FLOOR_TOLERANCE)
                && (height <= WadConstants.ACTOR_STEP_HEIGHT));
            this._applyForces(zone, env, height, grounded, toMetresPerS);
        };
        for (const m of this._monsters.getMonsters()) {
            pos = m.inst.getTransform().position;
            env = m.env;
            this._zones.eachZoneAt(pos[0], pos[2], applyToMonster);
        }
    }

    // The caller decides the carry eligibility; the friction gate is common.
    _applyForces(zone, env, height, carried, toMetresPerS) {
        if (zone.push !== null) {
            if (zone.push.kind === 'wind') {
                env.addThrust(zone.push.dx * toMetresPerS, zone.push.dz * toMetresPerS);
            } else if (carried) {
                env.addCarry(zone.push.dx * toMetresPerS, zone.push.dz * toMetresPerS);
            }
        }
        if ((zone.friction !== null) && (Math.abs(height) <= WadConstants.ON_FLOOR_TOLERANCE)) {
            env.setGroundFriction(zone.friction.friction);
        }
    }
}
