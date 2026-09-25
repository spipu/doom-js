/**
 * Teleport pad builder (linedef specials 39 W1 / 97 WR): an invisible zone on
 * the line plus a DoomTeleportInteraction moving the player to the landing of
 * the same tag. A teleporter whose tag has no landing is skipped.
 */
class WadTeleportBuilder {
    /**
     * @param {object}         level
     * @param {object}         analysis
     * @param {object}         landingsByTag - tag → {x, y, topY, z, yaw} (world coords)
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

    _buildTeleport(tp) {
        const {linedefs} = this._level;

        // Monster-only lines (125/126): the monster system tests their crossing.
        if (tp.monsterOnly === true) {
            return null;
        }
        const destination = this._landingsByTag[tp.tag];
        if (destination === undefined) {
            return null;
        }

        const ld = linedefs[tp.ldIdx];
        const {mesh, radius, segment} = WadMeshBuilder.buildLineZone(this._level, ld, WadConstants.WALK_ZONE_MARGIN);

        const teleportCode = 'teleport_' + tp.ldIdx;
        const onlyOnce = WadConstants.TELEPORT_ONCE_BY_SPECIAL[tp.special] ?? false;

        return {
            code:     teleportCode,
            textures: [],
            mesh:     mesh,
            // Front side only: EV_Teleport refuses the back of the line, "so you
            // can get out of the teleporter".
            crossSegment:   segment,
            crossFrontOnly: true,
            instanceData: {
                code:              teleportCode,
                position:          [0, 0, 0],
                rotation:          [0, 0, 0],
                trigger:           'proximity',
                loop:              false,
                onlyOnce:          onlyOnce,
                collisionShape:    'none',
                interactionRadius: radius,
                interactionShape:  'planar',   // walk-over line: fire on XZ crossing, any height
                damage:            null,
                interaction:       teleportCode,
                keyframes:         []
            },
            interactionSpec: {
                code:        teleportCode,
                destination: destination
            }
        };
    }
}
