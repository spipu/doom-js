/**
 * Impact-activated specials at runtime (p_spec.c P_ShootSpecialLine): every
 * hitscan trace is tested against the registered gun linedefs in 2D — vanilla
 * PTR_ShootTraverse fires the special as soon as the trace crosses the line,
 * before any height consideration, so a shot passing above or through the
 * opening still activates it. G1 lines burn out after one activation, GR
 * lines re-fire (a target already playing ignores the extra start()).
 */
class DoomGunTriggers {
    // The raycast stops ON the blocking face, so the tested trace is pushed a
    // little past the impact point — an impact on the trigger face itself must
    // still count as a crossing (vanilla fires the special on the hit line).
    static get IMPACT_SLACK() {
        return 8 * WadConstants.SCALE;
    }

    /**
     * @param {object[]} lines [{x1, z1, x2, z2, once, used, targets, doorVariant}]
     */
    constructor(lines) {
        this._lines = lines;
    }

    /**
     * Shot trace in world coords: from the muzzle to the impact point (or the
     * range end when nothing was hit).
     */
    onTrace(x1, z1, x2, z2) {
        const dx  = x2 - x1;
        const dz  = z2 - z1;
        const len = Math.hypot(dx, dz);
        if (len < 1e-9) {
            return;
        }
        const ex = x2 + (dx / len) * DoomGunTriggers.IMPACT_SLACK;
        const ez = z2 + (dz / len) * DoomGunTriggers.IMPACT_SLACK;

        for (const line of this._lines) {
            if (line.used) {
                continue;
            }
            if (!WadGeometry.segmentsCross(x1, z1, ex, ez, line.x1, line.z1, line.x2, line.z2)) {
                continue;
            }
            line.used = (line.once === true);
            this._fire(line);
        }
    }

    /**
     * Burnt-out flags of the registered lines, in their (deterministic) build
     * order — the only mutable state of the system.
     */
    exportState() {
        return this._lines.map((line) => line.used);
    }

    importState(usedFlags) {
        for (let i = 0; i < this._lines.length && i < usedFlags.length; i++) {
            this._lines[i].used = usedFlags[i];
        }
    }

    // --- Internal ---

    _fire(line) {
        DoomTriggerTargets.fire(line.targets, null, line.doorVariant);
    }

}
