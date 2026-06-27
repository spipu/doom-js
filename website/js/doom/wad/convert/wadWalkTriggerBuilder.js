/**
 * Walk-trigger builder (linedef specials 88/120/121/122 — WR/W1 lifts and, in
 * the future, remote floors/doors). A walk-over line is modelled as an invisible
 * proximity Instance at the middle of the linedef (one point, no faces) whose
 * DoomWalkTriggerInteraction start()s the tagged target instances when crossed —
 * the same "trigger → targets" pattern as a switch, but proximity-activated.
 *
 * Targets are the lift/rising-floor/door instances of the same tag, resolved
 * from the built-code sets (so a tag with no built element yields no target).
 */
class WadWalkTriggerBuilder {
    /**
     * @param {object}         level
     * @param {object}         analysis
     * @param {WadTextureBank} bank
     * @param {Set<string>}    builtLiftCodes
     * @param {Set<string>}    builtRisingCodes
     * @param {Set<string>}    builtDoorCodes
     */
    constructor(level, analysis, bank, builtLiftCodes, builtRisingCodes, builtDoorCodes, builtStairCodes) {
        this._level            = level;
        this._analysis         = analysis;
        this._bank             = bank;
        this._builtLiftCodes   = builtLiftCodes ?? new Set();
        this._builtRisingCodes = builtRisingCodes ?? new Set();
        this._builtDoorCodes   = builtDoorCodes ?? new Set();
        this._builtStairCodes  = builtStairCodes ?? new Set();
    }

    /**
     * @returns {object[]} [{code, textures:[], mesh, instanceData, interactionSpec}]
     */
    buildAll() {
        const result = [];
        for (const wt of this._analysis.walkTriggerLinedefs) {
            const built = this._buildWalkTrigger(wt);
            if (built !== null) {
                result.push(built);
            }
        }
        return result;
    }

    // --- Internal ---

    _buildWalkTrigger(wt) {
        const {vertexes, linedefs, sidedefs, sectors} = this._level;
        const SCALE = WadConstants.SCALE;

        const targets = this._resolveTargets(wt.tag);
        if (targets.length === 0) {
            return null;
        }

        const ld = linedefs[wt.ldIdx];
        const [dx1, dy1] = vertexes[ld.v1];
        const [dx2, dy2] = vertexes[ld.v2];
        // Zone centre = middle of the linedef, at player-centre height above the
        // front sector floor (the proximity test is 3D). Floor level, so a player
        // walking the line crosses it — unlike self-proximity on a raised lift.
        const fh = ((ld.right >= 0) ? sectors[sidedefs[ld.right].sector].fh : 0);
        const [cwx, cwz] = WadGeometry.doomToWorld((dx1 + dx2) / 2, (dy1 + dy2) / 2);
        const cwy = fh * SCALE + (WadConstants.PLAYER_HEIGHT / 2);

        const lenWorld = WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2) * SCALE;
        const radius   = (lenWorld / 2) + WadConstants.DOOR_ACTION_RADIUS;

        // Invisible object: one point (no faces) so getCenter = the zone centre.
        const mesh = WadMeshBuilder.newMesh();
        mesh.points.push([cwx, cwy, cwz]);

        const walkName = 'walk_' + wt.ldIdx;
        const onlyOnce = WadConstants.WALK_TRIGGER_ONCE_BY_SPECIAL[wt.special] ?? false;

        return {
            code:     walkName,
            textures: [],
            mesh:     mesh,
            instanceData: {
                code:              walkName,
                position:          [0, 0, 0],
                rotation:          [0, 0, 0],
                trigger:           'proximity',
                loop:              false,
                onlyOnce:          onlyOnce,
                collisionShape:    'none',
                interactionRadius: radius,
                triggerPlanar:     true,   // walk-over line: fire on XZ crossing, any height
                damage:            null,
                interaction:       walkName,
                keyframes:         []
            },
            interactionSpec: {
                code:    walkName,
                targets: targets
            }
        };
    }

    // Tagged lift + rising-floor + door instances of the same tag (shared
    // resolver — same logic as the switch builder, extended with rising floors).
    _resolveTargets(tag) {
        return WadMapAnalyzer.resolveTaggedTargets(this._level.sectors, tag, [
            {ids: this._analysis.movingFloorDownIds, prefix: 'lift_',        built: this._builtLiftCodes},
            {ids: this._analysis.risingFloorIds,     prefix: 'risingfloor_', built: this._builtRisingCodes},
            {ids: this._analysis.doorSectorIds,      prefix: 'door_',        built: this._builtDoorCodes},
            // Stairs: chained steps resolve by the trigger tag stored per step.
            {ids: this._analysis.stairIds, prefix: 'stair_', built: this._builtStairCodes,
                tagOf: (si) => this._analysis.stairStepTag[si]}
        ]);
    }
}
