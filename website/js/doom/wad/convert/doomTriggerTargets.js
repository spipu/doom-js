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
     *                                        (WadMapAnalyzer.stageRulesFor): the
     *                                        height this trigger drives it to,
     *                                        resolved against the live floor
     * @returns {boolean} whether the action took (vanilla EV_* return): at least
     *                    one target accepted it, or there was nothing to drive
     */
    static fire(targets, reverseTargets, cycleVariant = null, stageRules = null) {
        let taken = ((targets.length === 0) && ((reverseTargets ?? []).length === 0));
        for (const code of targets) {
            const inst = loader.instances().getByCode(code);
            const rule = ((stageRules !== null) ? (stageRules[code] ?? null) : null);
            taken = (((rule !== null)
                ? inst.startUntilVerticalDelta(DoomTriggerTargets.raiseShiftFor(inst, rule), cycleVariant)
                : inst.start(cycleVariant)) || taken);
        }
        for (const entry of (reverseTargets ?? [])) {
            taken = (loader.instances().getByCode(entry.code).startReverse(entry.timeScale) || taken);
        }

        return taken;
    }

    // World Y shift a trigger drives a staged floor to, from the LIVE floor
    // like vanilla EV_DoFloor: a fixed delta above it, or an absolute target
    // (next higher neighbour floor, lowest ceiling…) — the current shift when
    // the floor is already there or nothing is higher (no movement).
    static raiseShiftFor(inst, rule) {
        const shift    = inst.getVerticalShift();
        const liveFh   = rule.origFh + (shift / WadConstants.SCALE);
        const targetFh = rule.targetFhFor(liveFh);
        if ((targetFh === null) || (targetFh <= (liveFh + WadConstants.FLOOR_HEIGHT_EPSILON))) {
            return shift;
        }

        return ((targetFh - rule.origFh) * WadConstants.SCALE);
    }

    // Stop lines (54/89, 57/74): crossing PAUSES the targets in place (vanilla
    // EV_StopPlat stasis) instead of starting them.
    static pause(targets) {
        for (const code of targets) {
            loader.instances().getByCode(code).pause();
        }
    }
}
