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
     * @param {WadTextureBank} bank
     * @param {object}         landingsByTag - tag → {x, y, z, yaw} (world coords)
     */
    constructor(level, analysis, bank, landingsByTag) {
        this._level         = level;
        this._analysis      = analysis;
        this._bank          = bank;
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
        const {vertexes, linedefs, sidedefs, sectors} = this._level;
        const SCALE = WadConstants.SCALE;

        const destination = this._landingsByTag[tp.tag];
        if (destination === undefined) {
            return null;
        }

        const ld = linedefs[tp.ldIdx];
        const [dx1, dy1] = vertexes[ld.v1];
        const [dx2, dy2] = vertexes[ld.v2];
        // Trigger centre = middle of the linedef, at roughly player-centre height
        // above the front sector floor (the proximity test is 3D).
        const fh = ((ld.right >= 0) ? sectors[sidedefs[ld.right].sector].fh : 0);
        const [cwx, cwz] = WadGeometry.doomToWorld((dx1 + dx2) / 2, (dy1 + dy2) / 2);
        const cwy = fh * SCALE + (WadConstants.PLAYER_HEIGHT / 2);

        // Half the linedef length + a margin: covers the whole line, like the
        // W1 doors approximating a line crossing with a proximity sphere.
        const lenWorld = WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2) * SCALE;
        const radius   = (lenWorld / 2) + WadConstants.DOOR_ACTION_RADIUS;

        // Invisible object: one point (no faces) so getCenter = the trigger centre.
        const mesh = WadMeshBuilder.newMesh();
        mesh.points.push([cwx, cwy, cwz]);

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
