/**
 * Teleport pad builder (linedef specials 39 W1 / 97 WR). A teleport line is
 * modelled as an invisible proximity Instance: a single-point object at the
 * middle of the linedef (so getCenter gives the trigger centre, no faces to
 * render) plus a DoomTeleportInteraction that moves the player to the landing.
 *
 * The destination is the thing type 14 in the sector of the same tag, resolved
 * by WadWorldBuilder and passed in as landingsByTag (tag → {x, y, z, yaw} world).
 * A teleporter whose tag has no landing is skipped.
 */
class WadTeleportBuilder {
    /**
     * @param {object}         level
     * @param {object}         analysis
     * @param {object}         landingsByTag - tag → {x, y, z, yaw} (world coords)
     */
    constructor(level, analysis, landingsByTag) {
        this._level         = level;
        this._analysis      = analysis;
        this._landingsByTag = landingsByTag;
    }

    /**
     * @returns {object[]} [{code, textures:[], mesh, instanceData, interactionSpec}]
     */
    buildAll() {
        const result = [];
        for (const tp of this._analysis.teleporterLinedefs) {
            const built = this._buildTeleport(tp);
            if (built !== null) {
                result.push(built);
            }
        }
        return result;
    }

    // --- Internal ---

    _buildTeleport(tp) {
        const {linedefs} = this._level;

        // Monster-only lines (125/126) never get a player zone — the monster
        // system tests them by segment crossing at walk time.
        if (tp.monsterOnly === true) {
            return null;
        }
        const destination = this._landingsByTag[tp.tag];
        if (destination === undefined) {
            return null;
        }

        const ld = linedefs[tp.ldIdx];
        const {mesh, radius} = WadMeshBuilder.buildLineZone(this._level, ld);

        const teleportName = 'teleport_' + tp.ldIdx;
        const onlyOnce = WadConstants.TELEPORT_ONCE_BY_SPECIAL[tp.special] ?? false;

        return {
            code:     teleportName,
            textures: [],
            mesh:     mesh,
            instanceData: {
                code:              teleportName,
                position:          [0, 0, 0],
                rotation:          [0, 0, 0],
                trigger:           'proximity',
                loop:              false,
                onlyOnce:          onlyOnce,
                collisionShape:    'none',
                interactionRadius: radius,
                triggerPlanar:     true,   // walk-over line: fire on XZ crossing, any height
                damage:            null,
                interaction:       teleportName,
                keyframes:         []
            },
            interactionSpec: {
                code:        teleportName,
                destination: destination
            }
        };
    }
}
