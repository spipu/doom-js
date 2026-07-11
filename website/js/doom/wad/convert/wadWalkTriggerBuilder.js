/**
 * Walk-trigger builder (W1/WR lines driving lifts, floors, doors, ceilings,
 * stairs — see WALK_TRIGGER_SPECIALS). A walk-over line is modelled as an
 * invisible proximity Instance at the middle of the linedef (one point, no
 * faces) whose DoomWalkTriggerInteraction start()s (or pause()s, for the stop
 * lines) the tagged target instances when crossed — the same "trigger →
 * targets" pattern as a switch, but proximity-activated.
 *
 * Targets are the lift/rising-floor/door instances of the same tag, resolved
 * from the built-code sets (so a tag with no built element yields no target).
 *
 * Walk-over exits (52 normal / 124 secret) reuse the same zone with no targets:
 * crossing the line fires the exit callback (level end) instead.
 */
class WadWalkTriggerBuilder {
    /**
     * @param {object}         level
     * @param {object}         analysis
     * @param {Set<string>}    builtLiftCodes
     * @param {Set<string>}    builtRisingCodes
     * @param {Set<string>}    builtDoorCodes
     * @param {Set<string>}    builtStairCodes
     */
    constructor(level, analysis, builtLiftCodes, builtRisingCodes, builtDoorCodes, builtStairCodes) {
        this._level            = level;
        this._analysis         = analysis;
        this._builtLiftCodes   = builtLiftCodes;
        this._builtRisingCodes = builtRisingCodes;
        this._builtDoorCodes   = builtDoorCodes;
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
        const {linedefs} = this._level;

        // An exit line ends the level and ignores its tag (vanilla Doom): no
        // targets, and the zone is kept even though nothing is tag-resolved.
        const isExit  = (wt.isExit === true);
        const targets = ((isExit) ? [] : this._resolveTargets(wt.tag));
        if (targets.length === 0 && !isExit) {
            return null;
        }
        const split = WadMapAnalyzer.splitReverseTargets(this._analysis, wt.special, targets);

        // Zone at floor level on the linedef, so a player walking the line
        // crosses it — unlike self-proximity on a raised lift.
        const ld = linedefs[wt.ldIdx];
        const {mesh, radius} = WadMeshBuilder.buildLineZone(this._level, ld);

        const walkName = 'walk_' + wt.ldIdx;
        // Exits are all W1 (once); other specials carry their own W1/WR flag.
        const onlyOnce = ((isExit) ? true : (WadConstants.WALK_TRIGGER_ONCE_BY_SPECIAL[wt.special] ?? false));

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
                code:           walkName,
                targets:        split.start,
                reverseTargets: split.reverse,
                stop:           WadConstants.WALK_STOP_SPECIALS.has(wt.special),
                // Per-trigger door cycle (OWC vs open-stay on the same tag);
                // null for non-door specials, ignored by variant-less targets.
                doorVariant:    WadSwitchBuilder.doorVariantKey(wt.special),
                isExit:         isExit,
                secret:         WadConstants.EXIT_SECRET_SPECIALS.has(wt.special)
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
