/**
 * Ray and overlap queries against the LIVE bodies — the questions the engine's
 * own collision cannot answer, because it only ever knows triangles.
 *
 * Three shapes of question, one per caller family: a shot travelling a segment
 * (traceRay, every hitscan and missile), a horizontal aim looking for whoever
 * stands along a bearing (aimRay, the BFG spray), and "who is standing HERE"
 * (bodyAt, a mine that never moves — the maulotaur's floor fire).
 *
 * A body is a vertical cylinder: the actor radius of its instance and the
 * height of its DEFINITION, never the box of the billboard currently drawn.
 */
class DoomMonsterTrace {
    /**
     * @param {DoomMonsterSystem} system - owner, read for its live records
     */
    constructor(system) {
        this._system = system;
        this._user   = null;
    }

    setUser(user) {
        this._user = user;
        return this;
    }

    /**
     * Closest live body crossed by a ray, or null. The direction MUST be
     * normalized (the returned distance is the 3D ray parameter), and the
     * caller compares that distance with its own wall hit — the engine raycast
     * never sees these bodies.
     *
     * @param {object} opts {exclude: a body the ray goes through (its own
     *                       shooter), includePlayer: the player is a target too
     *                       (a monster's shot), immuneTo: skip whoever that body
     *                       cannot hurt (same species), thruGhost: pass through
     *                       Heretic's phantoms}
     * @returns {{ref, dist, point}|null}
     */
    ray(ox, oy, oz, dx, dy, dz, maxDist, opts = {}) {
        const exclude  = (opts.exclude ?? null);
        const immuneTo = (opts.immuneTo ?? null);
        // +THRUGHOST (the knight's axes, the lich's ice ball, the Heretic
        // weapons): the shot goes clean through a phantom, which is the whole
        // point of the ghost variants.
        const thruGhost = (opts.thruGhost === true);
        let best = null;
        const consider = (ref, cx, cz, radius, feetY, topY) => {
            if ((ref === exclude) || (thruGhost && DoomActorRef.isGhost(ref))
                || ((immuneTo !== null) && !DoomMonsterDamage.canAttackHurt(ref, immuneTo))) {
                return;
            }
            const t = DoomMonsterTrace._cylinder(ox, oy, oz, dx, dy, dz, cx, cz, radius, feetY, topY);
            if ((t !== null) && (t <= maxDist) && ((best === null) || (t < best.dist))) {
                best = {ref: ref, dist: t, point: [ox + dx * t, oy + dy * t, oz + dz * t]};
            }
        };

        for (const m of this._system.getMonsters()) {
            if (m.dead) {
                continue;
            }
            const pos = m.inst.getTransform().position;
            consider(m, pos[0], pos[2], m.inst.getCollisionRadius(),
                pos[1], pos[1] + m.def.getHeight() * WadConstants.SCALE);
        }
        if ((opts.includePlayer === true) && (this._user !== null) && !this._user.isDead()) {
            consider(this._user, this._user.x, this._user.z, this._user.getRadius(),
                this._user.y, this._user.y + this._user.getCurrentHeight());
        }

        return best;
    }

    /**
     * A_BFGSpray-style aim: closest LIVE body whose XZ circle crosses the
     * HORIZONTAL ray within maxDist — the vertical axis is ignored, like the
     * slope search of P_AimLineAttack, which finds a target above or below the
     * eye plane. The caller settles visibility with its own LOS check.
     *
     * @returns {{record, dist}|null}
     */
    aim(ox, oz, dx, dz, maxDist) {
        let best = null;
        for (const m of this._system.getMonsters()) {
            if (m.dead) {
                continue;
            }
            const pos = m.inst.getTransform().position;
            const t   = DoomMonsterTrace._circle(ox, oz, dx, dz, pos[0], pos[2], m.inst.getCollisionRadius());
            if ((t !== null) && (t <= maxDist) && ((best === null) || (t < best.dist))) {
                best = {record: m, dist: t};
            }
        }

        return best;
    }

    /**
     * The first live body standing on a spot — the overlap answer the ray
     * cannot give, because a mine never moves along a segment. This is how the
     * maulotaur's floor fire knows it has been trodden on.
     *
     * @param {object} opts {exclude?, immuneTo?, includePlayer?}
     * @returns {{ref, point}|null}
     */
    bodyAt(x, z, radius, opts = {}) {
        const exclude  = (opts.exclude ?? null);
        const immuneTo = (opts.immuneTo ?? null);
        for (const m of this._system.getMonsters()) {
            if (m.dead || (m === exclude)
                || ((immuneTo !== null) && !DoomMonsterDamage.canAttackHurt(m, immuneTo))) {
                continue;
            }
            const pos = m.inst.getTransform().position;
            if (WadGeometry.boxesOverlap2d(x, z, radius, pos[0], pos[2], m.inst.getCollisionRadius())) {
                return {ref: m, point: m.inst.getWorldCenter()};
            }
        }
        const u = this._user;
        if ((opts.includePlayer === true) && (u !== null) && !u.isDead()
            && (u !== exclude) && WadGeometry.boxesOverlap2d(x, z, radius, u.x, u.z, u.getRadius())) {
            return {ref: u, point: [u.x, u.y + u.getCurrentHeight() / 2, u.z]};
        }

        return null;
    }

    // --- Internal: the geometry ---

    // Ray parameter against one 2D circle (entry point, clamped to the origin
    // when it starts inside), or null when the ray misses or leaves it behind.
    static _circle(ox, oz, dx, dz, cx, cz, r) {
        const span = DoomMonsterTrace._circleSpan(ox - cx, oz - cz, dx, dz, r);

        return ((span !== null) ? span.near : null);
    }

    // Entry and exit parameters of the ray on the XZ circle (entry clamped to
    // the origin when the ray starts inside), or null when it misses or the
    // circle is entirely behind. The quadratic of both ray tests.
    static _circleSpan(ex, ez, dx, dz, r) {
        const a = dx * dx + dz * dz;
        if (a < DoomMonsterTrace.RAY_MIN_XZ) {
            // No XZ direction (a shot straight up or down): the quadratic
            // degenerates to 0/0. The cylinder test owns that case through its
            // cap branch, the flat circle test simply has no answer.
            return null;
        }
        const b    = 2 * (ex * dx + ez * dz);
        const c    = ex * ex + ez * ez - r * r;
        const disc = b * b - 4 * a * c;
        if (disc < 0) {
            return null;
        }
        const sq  = Math.sqrt(disc);
        const far = (-b + sq) / (2 * a);
        if (far < 0) {
            return null;
        }

        return {near: Math.max(0, (-b - sq) / (2 * a)), far: far};
    }

    // Ray parameter against one vertical cylinder, or null. Solved on the XZ
    // circle (the quadratic keeps the 3D ray parameter since the direction is
    // 3D-normalized), then gated on the vertical span — with a cap crossing
    // when the ray enters above the head or below the feet and dives into it.
    static _cylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, yBottom, yTop) {
        const ex = ox - cx;
        const ez = oz - cz;
        const a  = dx * dx + dz * dz;
        if (a < DoomMonsterTrace.RAY_MIN_XZ) {
            // Straight vertical shot: hit only when already over the body.
            if (((ex * ex) + (ez * ez)) > (r * r)) {
                return null;
            }
            const tCap = (((dy > 0) ? yBottom : yTop) - oy) / dy;

            return ((tCap >= 0) ? tCap : null);
        }
        const span = DoomMonsterTrace._circleSpan(ex, ez, dx, dz, r);
        if (span === null) {
            return null;
        }
        const tNear = span.near;
        const tFar  = span.far;
        const yNear = oy + dy * tNear;
        if ((yNear >= yBottom) && (yNear <= yTop)) {
            return tNear;
        }
        if (dy === 0) {
            return null;
        }
        // Entering above the head (or below the feet): the ray may still dive
        // onto the matching cap while inside the circle.
        const tCap = (((yNear > yTop) ? yTop : yBottom) - oy) / dy;

        return (((tCap >= tNear) && (tCap <= tFar) && (tCap >= 0)) ? tCap : null);
    }
}

// Below this squared XZ length a ray direction counts as purely vertical: the
// ray/circle quadratic has no solution there (0/0), the cylinder answers on its
// caps instead.
DoomMonsterTrace.RAY_MIN_XZ = 1e-9;
