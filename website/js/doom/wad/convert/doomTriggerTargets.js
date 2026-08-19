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
     */
    static fire(targets, reverseTargets, cycleVariant = null) {
        for (const code of targets) {
            loader.instances().getByCode(code).start(cycleVariant);
        }
        for (const entry of (reverseTargets ?? [])) {
            loader.instances().getByCode(entry.code).startReverse(entry.timeScale);
        }
    }

    // Stop lines (54/89, 57/74): crossing PAUSES the targets in place (vanilla
    // EV_StopPlat stasis) instead of starting them.
    static pause(targets) {
        for (const code of targets) {
            loader.instances().getByCode(code).pause();
        }
    }
}
