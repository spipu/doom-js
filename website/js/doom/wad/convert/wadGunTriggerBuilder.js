/**
 * Gun-trigger builder (G1/GR impact lines 24/46/47 — GUN_BY_SPECIAL). No
 * instance and no zone: a shot is a trace, so the runtime side
 * (DoomGunTriggers) tests every hitscan trace against the line segment in 2D,
 * vanilla PTR_ShootTraverse style. This builder only resolves the world-space
 * segment, the trigger behaviour and the tagged targets of each impact line.
 *
 * Targets: 46 opens the tagged doors (EV_DoDoor open — the 'one-way@2'
 * keyframe variant on doors that also carry manual cycles), 24/47 raise the
 * tagged floors (EV_DoFloor raiseFloor / EV_DoPlat raiseToNearestAndChange,
 * both carried by the rising-floor instances).
 */
class WadGunTriggerBuilder {
    /**
     * @param {object}      level
     * @param {object}      analysis
     * @param {Set<string>} builtRisingCodes
     * @param {Set<string>} builtDoorCodes
     */
    constructor(level, analysis, builtRisingCodes, builtDoorCodes) {
        this._level            = level;
        this._analysis         = analysis;
        this._builtRisingCodes = builtRisingCodes;
        this._builtDoorCodes   = builtDoorCodes;
    }

    /**
     * @returns {object[]} [{x1, z1, x2, z2, once, used, targets, cycleVariant}]
     */
    buildAll() {
        const result = [];
        for (const gt of this._analysis.gunTriggerLinedefs) {
            const built = this._buildGunTrigger(gt);
            if (built !== null) {
                result.push(built);
            }
        }
        return result;
    }

    // --- Internal ---

    _buildGunTrigger(gt) {
        const targets = this._resolveTargets(gt);
        if (targets.length === 0) {
            return null;
        }

        const ld = this._level.linedefs[gt.ldIdx];
        const [dx1, dy1] = this._level.vertexes[ld.v1];
        const [dx2, dy2] = this._level.vertexes[ld.v2];
        const [x1, z1] = WadGeometry.doomToWorld(dx1, dy1);
        const [x2, z2] = WadGeometry.doomToWorld(dx2, dy2);

        return {
            x1:          x1,
            z1:          z1,
            x2:          x2,
            z2:          z2,
            once:        (WadConstants.GUN_BY_SPECIAL[gt.special].once === true),
            used:        false,
            targets:     targets,
            cycleVariant: WadConstants.cycleKeyForSpecial(gt.special)
        };
    }

    _resolveTargets(gt) {
        const families = ((gt.special === 46)
            ? [{ids: this._analysis.doorSectorIds, prefix: 'door_', built: this._builtDoorCodes}]
            : [WadMapAnalyzer.risingFloorFamily(this._analysis, this._level.sectors, this._builtRisingCodes, gt.special)]);

        return WadMapAnalyzer.resolveTaggedTargets(this._level.sectors, gt.tag, families);
    }
}
