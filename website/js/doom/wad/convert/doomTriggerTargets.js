/**
 * Shared firing of a trigger's resolved targets — switch, walk zone, gun line
 * and boss death drive their movers through the same verbs: forward targets
 * start on the trigger's own door cycle, reverse entries play backward at the
 * triggering special's vanilla speed.
 */
class DoomTriggerTargets {
    /**
     * @param {string[]}    targets        - instance codes to start
     * @param {object[]|null} reverseTargets - {code, timeScale} played backward
     * @param {string|null} cycleVariant    - per-trigger cycle key (door or lift-raise)
     * @param {object|null} stageRules      - code → stage rule of a staged floor
     *                                        (WadMapAnalyzer.stageRulesFor): how
     *                                        many legs this trigger runs, resolved
     *                                        against the live floor
     * @returns {boolean} whether the action took (vanilla EV_* return): at least
     *                    one target accepted it, or there was nothing to drive
     */
    static fire(targets, reverseTargets, cycleVariant = null, stageRules = null) {
        let taken = ((targets.length === 0) && ((reverseTargets ?? []).length === 0));
        for (const code of targets) {
            const inst = loader.instances().getByCode(code);
            const rule = ((stageRules !== null) ? (stageRules[code] ?? null) : null);
            taken = (((rule !== null)
                ? inst.startStages(DoomTriggerTargets.stagesFor(inst, rule), cycleVariant)
                : inst.start(cycleVariant)) || taken);
        }
        for (const entry of (reverseTargets ?? [])) {
            taken = (loader.instances().getByCode(entry.code).startReverse(entry.timeScale) || taken);
        }

        return taken;
    }

    // Legs a trigger runs on a staged floor, from the LIVE floor like vanilla
    // EV_DoFloor: a fixed delta is a fixed number of legs; an absolute target
    // (next higher neighbour floor, lowest ceiling…) takes as many legs as
    // remain up to it — none when the floor is already there.
    static stagesFor(inst, rule) {
        if (rule.stages !== undefined) {
            return rule.stages;
        }
        const liveFh   = rule.origFh + (inst.getVerticalShift() / WadConstants.SCALE);
        const targetFh = rule.targetFhFor(liveFh + DoomTriggerTargets.FLOOR_EPSILON);
        if (targetFh === null) {
            return 0;
        }

        return Math.max(0, Math.ceil((targetFh - liveFh - DoomTriggerTargets.FLOOR_EPSILON) / rule.step));
    }

    // Stop lines (54/89, 57/74): crossing PAUSES the targets in place (vanilla
    // EV_StopPlat stasis) instead of starting them.
    static pause(targets) {
        for (const code of targets) {
            loader.instances().getByCode(code).pause();
        }
    }
}

// Tolerance (Doom units) when comparing a live floor with a target height
DoomTriggerTargets.FLOOR_EPSILON = 1e-3;
