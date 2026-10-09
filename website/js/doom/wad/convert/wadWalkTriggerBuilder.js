/**
 * Walk-trigger builder (W1/WR lines): an invisible zone on the line whose
 * DoomWalkTriggerInteraction starts (or, for the stop lines, pauses) the built
 * movers of its tag when crossed, or runs its line action. Walk-over exits
 * (52 / 124 secret) reuse the zone with no targets.
 */
class WadWalkTriggerBuilder {
    /**
     * @param {object}         level
     * @param {object}         analysis
     * @param {Set<string>}    builtLiftCodes
     * @param {Set<string>}    builtRisingCodes
     * @param {Set<string>}    builtDoorCodes
     * @param {Set<string>}    builtStairCodes
     * @param {function}       liveFloorOf - (si) → the sector's live floor height, for the stage rules resolved at fire time
     */
    constructor(level, analysis, builtLiftCodes, builtRisingCodes, builtDoorCodes, builtStairCodes, liveFloorOf) {
        this._level            = level;
        this._analysis         = analysis;
        this._builtLiftCodes   = builtLiftCodes;
        this._builtRisingCodes = builtRisingCodes;
        this._builtDoorCodes   = builtDoorCodes;
        this._builtStairCodes  = builtStairCodes ?? new Set();
        this._liveFloorOf      = liveFloorOf;
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

    _buildWalkTrigger(wt) {
        const {linedefs, sectors} = this._level;
        const ld = linedefs[wt.ldIdx];

        // An exit ignores its tag (vanilla).
        const isExit     = (wt.isExit === true);
        const lineAction = WadMapAnalyzer.lineActionOf(sectors, ld);
        const targets    = ((isExit || (lineAction !== null)) ? [] : this._resolveTargets(wt.tag, wt.special));
        if ((targets.length === 0) && !isExit && (lineAction === null)) {
            return null;
        }
        const split = WadMapAnalyzer.splitReverseTargets(this._analysis, wt.special, targets);

        const {mesh, radius, segment} = WadMeshBuilder.buildLineZone(this._level, ld, WadConstants.WALK_ZONE_MARGIN);

        const walkCode = 'walk_' + wt.ldIdx;
        // Exits are all W1.
        const onlyOnce = (isExit || !WadConstants.specialRepeats(wt.special));

        return {
            code:     walkCode,
            textures: [],
            mesh:     mesh,
            // Kept out of instanceData: the crossing rule is game-side (WadLineCrossing).
            crossSegment: segment,
            instanceData: {
                code:              walkCode,
                position:          [0, 0, 0],
                rotation:          [0, 0, 0],
                trigger:           'proximity',
                loop:              false,
                onlyOnce:          onlyOnce,
                collisionShape:    'none',
                interactionRadius: radius,
                interactionShape:  'planar',   // walk-over line: fire on XZ crossing, any height
                damage:            null,
                interaction:       walkCode,
                keyframes:         []
            },
            interactionSpec: {
                code:           walkCode,
                targets:        split.start,
                reverseTargets: split.reverse,
                stop:           WadConstants.WALK_STOP_SPECIALS.has(wt.special),
                cycleVariant:   WadConstants.cycleKeyForSpecial(wt.special),
                stageRules:     WadMapAnalyzer.stageRulesFor(this._analysis, wt.special, split.start, this._liveFloorOf),
                isExit:         isExit,
                secret:         WadConstants.EXIT_SECRET_SPECIALS.has(wt.special),
                lineAction:     lineAction
            }
        };
    }

    _resolveTargets(tag, special) {
        return WadMapAnalyzer.resolveTaggedTargets(this._level.sectors, tag, WadMapAnalyzer.moverFamilies(
            this._analysis, this._level.sectors,
            {lifts: this._builtLiftCodes, rising: this._builtRisingCodes, doors: this._builtDoorCodes, stairs: this._builtStairCodes},
            special));
    }
}
