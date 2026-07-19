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
            if (!DoomGunTriggers._segmentsCross(x1, z1, ex, ez, line.x1, line.z1, line.x2, line.z2)) {
                continue;
            }
            line.used = (line.once === true);
            this._fire(line);
        }
    }

    // --- Internal ---

    // Target codes are guaranteed by the builder (filtered on the built-code
    // sets), same contract as the switch/walk interactions.
    _fire(line) {
        for (const code of line.targets) {
            loader.instances().getByCode(code).start(line.doorVariant);
        }
    }

    static _segmentsCross(ax, az, bx, bz, cx, cz, dx, dz) {
        const d1 = DoomGunTriggers._side(cx, cz, dx, dz, ax, az);
        const d2 = DoomGunTriggers._side(cx, cz, dx, dz, bx, bz);
        const d3 = DoomGunTriggers._side(ax, az, bx, bz, cx, cz);
        const d4 = DoomGunTriggers._side(ax, az, bx, bz, dx, dz);

        return (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)));
    }

    static _side(ax, az, bx, bz, px, pz) {
        return ((bx - ax) * (pz - az)) - ((bz - az) * (px - ax));
    }
}
