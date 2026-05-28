class Collision {
    constructor() {
        this._static  = []; // [{floors, ceilings, walls}]
        this._dynamic = []; // [{instance, localTris, bRadius, centerLocal, floors, ceilings, walls, centerWorld, _platformDeltaApplied}]
    }

    // --- Public setup ---

    addMap(object3d) {
        this._static.push(this._buildStaticCollider(object3d));
    }

    addInstance(instance) {
        if (!instance.isCollidable()) return;
        const obj = instance.getObject();
        const localTris = [];
        for (const fc of obj.faceList) {
            const A = obj.ptOrigin[fc[0]], B = obj.ptOrigin[fc[1]], C = obj.ptOrigin[fc[2]];
            localTris.push([[A[0],A[1],A[2]], [B[0],B[1],B[2]], [C[0],C[1],C[2]]]);
        }
        const dc = {
            instance,
            localTris,
            bRadius:               obj.getBoundingRadius(),
            centerLocal:           obj.getCenter(),
            floors: [], ceilings: [], walls: [],
            centerWorld:           [0, 0, 0],
            _platformDeltaApplied: null,
        };
        this._dynamic.push(dc);
        this._updateDynamicCollider(dc);
    }

    updateDynamicColliders() {
        for (const dc of this._dynamic) this._updateDynamicCollider(dc);
    }

    // --- Queries ---

    getFloor(px, pz, r, maxSearchY = Infinity) {
        let maxY = -Infinity;
        const check = (tri) => {
            if (!this._aabbXZ(px, pz, r, tri)) return;
            if (!this._circleIntersectsTri(px, pz, r, tri)) return;
            const y = (tri.d - tri.n[0]*px - tri.n[2]*pz) / tri.n[1];
            if (y > maxY && y <= maxSearchY) maxY = y;
        };
        for (const sc of this._static)  sc.floors.forEach(check);
        for (const dc of this._dynamic) { if (this._broadphaseXZ(px, pz, r, dc)) dc.floors.forEach(check); }
        return maxY;
    }

    getFloorNormal(px, pz, r, maxSearchY = Infinity) {
        let maxY = -Infinity, bestN = null;
        const check = (tri) => {
            if (!this._aabbXZ(px, pz, r, tri)) return;
            if (!this._circleIntersectsTri(px, pz, r, tri)) return;
            const y = (tri.d - tri.n[0]*px - tri.n[2]*pz) / tri.n[1];
            if (y > maxY && y <= maxSearchY) { maxY = y; bestN = tri.n; }
        };
        for (const sc of this._static)  sc.floors.forEach(check);
        for (const dc of this._dynamic) { if (this._broadphaseXZ(px, pz, r, dc)) dc.floors.forEach(check); }
        return bestN;
    }

    getCeiling(px, pz, r, headY) {
        let minY = Infinity;
        const check = (tri) => {
            if (!this._aabbXZ(px, pz, r, tri)) return;
            if (!this._circleIntersectsTri(px, pz, r, tri)) return;
            const y = (tri.d - tri.n[0]*px - tri.n[2]*pz) / tri.n[1];
            if (y > headY && y < minY) minY = y;
        };
        for (const sc of this._static)  sc.ceilings.forEach(check);
        for (const dc of this._dynamic) { if (this._broadphaseXZ(px, pz, r, dc)) dc.ceilings.forEach(check); }
        return minY;
    }

    resolveWall(cx, cz, vx, vz, r, feetY, h, stepHeight = 0) {
        const allWalls = [
            ...this._static.map(sc => sc.walls),
            ...this._dynamic.map(dc => dc.walls),
        ];
        return this._resolveWallFromLists(cx, cz, vx, vz, r, feetY, h, allWalls, stepHeight);
    }

    // --- Platform riding & object blocking ---

    applyPlatformRiding(user) {
        for (const dc of this._dynamic) {
            dc._platformDeltaApplied = null;
            if (!dc.instance.isCollidable()) continue;
            const prevTf = dc.instance.getPreviousTransform();
            if (!prevTf) continue;
            const curTf = dc.instance.getTransform();

            const dx  = (curTf.position[0] + curTf.deltaTranslate[0]) - (prevTf.position[0] + prevTf.deltaTranslate[0]);
            const dy  = (curTf.position[1] + curTf.deltaTranslate[1]) - (prevTf.position[1] + prevTf.deltaTranslate[1]);
            const dz  = (curTf.position[2] + curTf.deltaTranslate[2]) - (prevTf.position[2] + prevTf.deltaTranslate[2]);
            const dRy = (curTf.rotation[1] + curTf.deltaRotate[1]) - (prevTf.rotation[1] + prevTf.deltaRotate[1]);

            if (Math.abs(dx) < 1e-8 && Math.abs(dy) < 1e-8 && Math.abs(dz) < 1e-8 && Math.abs(dRy) < 1e-8) continue;

            // Is player standing on top of this instance?
            let floorY = -Infinity;
            for (const tri of dc.floors) {
                if (!this._aabbXZ(user.x, user.z, user.getRadius(), tri)) continue;
                if (!this._circleIntersectsTri(user.x, user.z, user.getRadius(), tri)) continue;
                const y = (tri.d - tri.n[0]*user.x - tri.n[2]*user.z) / tri.n[1];
                if (y > floorY) floorY = y;
            }
            if (floorY === -Infinity || Math.abs(user.y - floorY) > 0.15) continue;

            const origX = user.x, origZ = user.z;
            const staticWalls = this._static.map(sc => sc.walls);

            // Step 1: polar rotation — orbit user around previous platform center by dRy
            const prevCx = prevTf.position[0] + prevTf.deltaTranslate[0];
            const prevCz = prevTf.position[2] + prevTf.deltaTranslate[2];
            const relX   = user.x - prevCx;
            const relZ   = user.z - prevCz;
            const r      = Math.sqrt(relX*relX + relZ*relZ);
            const newAng = Math.atan2(relZ, relX) - dRy * DEG_TO_RAD;
            const rotX   = prevCx + r * Math.cos(newAng);
            const rotZ   = prevCz + r * Math.sin(newAng);
            const res1   = this._resolveWallFromLists(user.x, user.z, rotX - user.x, rotZ - user.z, user.getRadius(), user.y, user.getCurrentHeight(), staticWalls);
            user.x = res1.x; user.z = res1.z;

            // Step 2: platform translation drift (dx, dz)
            const res2 = this._resolveWallFromLists(user.x, user.z, dx, dz, user.getRadius(), user.y, user.getCurrentHeight(), staticWalls);
            user.x = res2.x; user.z = res2.z;

            // Y: clamp against static geometry so the player detaches when the platform
            // passes through a floor (descending) or a ceiling (ascending).
            const newY = user.y + dy;
            if (dy < 0) {
                const staticFloor = this._getStaticFloor(user.x, user.z, user.getRadius());
                user.y = staticFloor !== -Infinity ? Math.max(newY, staticFloor) : newY;
            } else if (dy > 0) {
                const staticCeil = this._getStaticCeiling(user.x, user.z, user.getRadius(), user.y + user.getCurrentHeight());
                user.y = Math.min(newY, staticCeil - user.getCurrentHeight());
            } else {
                user.y = newY;
            }

            user.yaw += dRy;
            user.syncPositionTracking();

            dc._platformDeltaApplied = { x: user.x - origX, y: dy, z: user.z - origZ, yaw: dRy };
        }
    }

    resolveObjectPlayerBlockage(user) {
        for (const dc of this._dynamic) {
            if (!dc.instance.isCollidable()) continue;
            if (!this._instanceCylinderIntersects(user, dc)) continue;

            const prev = dc.instance.getPreviousTransform();
            if (prev) {
                // Only roll back if the movement caused the intersection (not pre-existing)
                if (this._instanceCylinderIntersectsAtTransform(user, dc, prev)) continue;
                dc.instance.rollbackTransform(prev);
                this._updateDynamicCollider(dc);
            }

            if (dc._platformDeltaApplied) {
                user.x   -= dc._platformDeltaApplied.x;
                user.y   -= dc._platformDeltaApplied.y;
                user.z   -= dc._platformDeltaApplied.z;
                user.yaw += dc._platformDeltaApplied.yaw;
                dc._platformDeltaApplied = null;
            }
        }
    }

    // --- Private: collider builders ---

    _buildStaticCollider(obj) {
        const floors = [], ceilings = [], walls = [];
        for (const fc of obj.faceList) {
            const A = obj.ptOrigin[fc[0]], B = obj.ptOrigin[fc[1]], C = obj.ptOrigin[fc[2]];
            const tri = this._makeTri([A[0],A[1],A[2]], [B[0],B[1],B[2]], [C[0],C[1],C[2]]);
            if (!tri) continue;
            if      (tri.n[1] >  0.7) floors.push(tri);
            else if (tri.n[1] < -0.7) ceilings.push(tri);
            else                       walls.push(tri);
        }
        return { floors, ceilings, walls };
    }

    _makeTri(A, B, C) {
        const abx = B[0]-A[0], aby = B[1]-A[1], abz = B[2]-A[2];
        const acx = C[0]-A[0], acy = C[1]-A[1], acz = C[2]-A[2];
        let nx = aby*acz - abz*acy;
        let ny = abz*acx - abx*acz;
        let nz = abx*acy - aby*acx;
        const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
        if (len < 1e-10) return null;
        nx /= len; ny /= len; nz /= len;
        return {
            pts: [A, B, C],
            n:   [nx, ny, nz],
            d:   nx*A[0] + ny*A[1] + nz*A[2],
            xMin: Math.min(A[0],B[0],C[0]), xMax: Math.max(A[0],B[0],C[0]),
            yMin: Math.min(A[1],B[1],C[1]), yMax: Math.max(A[1],B[1],C[1]),
            zMin: Math.min(A[2],B[2],C[2]), zMax: Math.max(A[2],B[2],C[2]),
        };
    }

    _updateDynamicCollider(dc) {
        const tf  = dc.instance.getTransform();
        const m   = this._buildInstanceMatrix(tf);
        const floors = [], ceilings = [], walls = [];
        for (const [la, lb, lc] of dc.localTris) {
            const wa = m.multiplyPosition([...la, 1]);
            const wb = m.multiplyPosition([...lb, 1]);
            const wc = m.multiplyPosition([...lc, 1]);
            const tri = this._makeTri([wa[0],wa[1],wa[2]], [wb[0],wb[1],wb[2]], [wc[0],wc[1],wc[2]]);
            if (!tri) continue;
            if      (tri.n[1] >  0.7) floors.push(tri);
            else if (tri.n[1] < -0.7) ceilings.push(tri);
            else                       walls.push(tri);
        }
        dc.floors   = floors;
        dc.ceilings = ceilings;
        dc.walls    = walls;
        const lc = dc.centerLocal;
        const cw = m.multiplyPosition([lc[0], lc[1], lc[2], 1]);
        dc.centerWorld = [cw[0], cw[1], cw[2]];
    }

    _buildInstanceMatrix(tf) {
        const [px, py, pz]    = tf.position;
        const [irx, iry, irz] = tf.rotation;
        const [dtx, dty, dtz] = tf.deltaTranslate;
        const [drx, dry, drz] = tf.deltaRotate;
        const m = new Matrix(); m.identity();
        const push = (fn, ...args) => { const r = new Matrix(); r[fn](...args); m.multiply(r); };
        push('translation', px, py, pz);
        if (irx) push('rotationX', irx * DEG_TO_RAD);
        if (irz) push('rotationZ', irz * DEG_TO_RAD);
        if (iry) push('rotationY', iry * DEG_TO_RAD);
        if (dtx || dty || dtz) push('translation', dtx, dty, dtz);
        if (drx) push('rotationX', drx * DEG_TO_RAD);
        if (drz) push('rotationZ', drz * DEG_TO_RAD);
        if (dry) push('rotationY', dry * DEG_TO_RAD);
        return m;
    }

    // --- Private: wall resolution ---

    _resolveWallFromLists(cx, cz, vx, vz, r, feetY, h, wallLists, stepHeight = 0) {
        const EPSILON = 1e-4;
        let C = [cx, cz], V = [vx, vz];
        let prevNx = null, prevNz = null;

        // Depenetration: push the circle out of any wall segment it already overlaps.
        // Without this, _sweptCircleVsSegment returns null for already-overlapping geometry
        // (t < 0), causing those faces to be ignored and the player to pass through.
        for (const walls of wallLists) {
            for (const tri of walls) {
                if (feetY >= tri.yMax || feetY + h < tri.yMin) continue;
                if (stepHeight > 0 && tri.yMax <= feetY + stepHeight) continue;
                const pts = tri.pts;
                for (let e = 0; e < 3; e++) {
                    const P = pts[e], Q = pts[(e + 1) % 3];
                    const sdx = Q[0]-P[0], sdz = Q[2]-P[2];
                    const len2 = sdx*sdx + sdz*sdz;
                    if (len2 < 1e-10) continue;
                    const t = Math.max(0, Math.min(1, ((C[0]-P[0])*sdx + (C[1]-P[2])*sdz) / len2));
                    const ex = C[0] - (P[0] + t*sdx);
                    const ez = C[1] - (P[2] + t*sdz);
                    const dist = Math.sqrt(ex*ex + ez*ez);
                    if (dist < r && dist > 1e-6) {
                        const push = r - dist;
                        C[0] += (ex / dist) * push;
                        C[1] += (ez / dist) * push;
                    }
                }
            }
        }

        for (let iter = 0; iter < 3; iter++) {
            if (Math.sqrt(V[0]*V[0] + V[1]*V[1]) < EPSILON) break;

            let tMin = 1.0, bestNx = 0, bestNz = 0, hit = false;

            const check = (tri) => {
                if (feetY >= tri.yMax || feetY + h < tri.yMin) return;
                if (stepHeight > 0 && tri.yMax <= feetY + stepHeight) return;
                if (!this._aabbXZSweep(C[0], C[1], V[0], V[1], r, tri)) return;
                const [A, B, Ct] = tri.pts;
                for (const [P, Q] of [[A,B],[B,Ct],[Ct,A]]) {
                    const res = this._sweptCircleVsSegment(C[0], C[1], V[0], V[1], P[0], P[2], Q[0], Q[2], r);
                    if (res && res.t < tMin) { tMin = res.t; bestNx = res.nx; bestNz = res.nz; hit = true; }
                }
            };
            for (const walls of wallLists) walls.forEach(check);

            C[0] += (tMin - (hit ? EPSILON : 0)) * V[0];
            C[1] += (tMin - (hit ? EPSILON : 0)) * V[1];
            if (!hit) break;

            const vr0 = (1 - tMin) * V[0], vr1 = (1 - tMin) * V[1];
            const dot = vr0 * bestNx + vr1 * bestNz;
            V[0] = vr0 - dot * bestNx;
            V[1] = vr1 - dot * bestNz;

            if (prevNx !== null) {
                const dot2 = V[0]*prevNx + V[1]*prevNz;
                V[0] -= dot2 * prevNx;
                V[1] -= dot2 * prevNz;
            }
            prevNx = bestNx; prevNz = bestNz;
        }
        return { x: C[0], z: C[1] };
    }

    // --- Private: cylinder-instance intersection ---

    _instanceCylinderIntersects(user, dc) {
        const bpDx = user.x - dc.centerWorld[0], bpDz = user.z - dc.centerWorld[2];
        if (Math.sqrt(bpDx*bpDx + bpDz*bpDz) > user.getRadius() + dc.bRadius) return false;
        const h = user.getCurrentHeight();
        // Floors excluded: standing on an object's floor is normal (platform riding), not a block
        for (const tri of dc.walls) {
            if (user.y > tri.yMax || user.y + h < tri.yMin) continue;
            if (this._circleIntersectsTri(user.x, user.z, user.getRadius(), tri)) return true;
        }
        for (const tri of dc.ceilings) {
            if (user.y > tri.yMax || user.y + h < tri.yMin) continue;
            if (this._circleIntersectsTri(user.x, user.z, user.getRadius(), tri)) return true;
        }
        return false;
    }

    _instanceCylinderIntersectsAtTransform(user, dc, tf) {
        const m  = this._buildInstanceMatrix(tf);
        const cw = m.multiplyPosition([dc.centerLocal[0], dc.centerLocal[1], dc.centerLocal[2], 1]);
        const bpDx = user.x - cw[0], bpDz = user.z - cw[2];
        if (Math.sqrt(bpDx*bpDx + bpDz*bpDz) > user.getRadius() + dc.bRadius) return false;
        const h = user.getCurrentHeight();
        for (const [la, lb, lc] of dc.localTris) {
            const wa = m.multiplyPosition([la[0], la[1], la[2], 1]);
            const wb = m.multiplyPosition([lb[0], lb[1], lb[2], 1]);
            const wc = m.multiplyPosition([lc[0], lc[1], lc[2], 1]);
            const tri = this._makeTri([wa[0],wa[1],wa[2]], [wb[0],wb[1],wb[2]], [wc[0],wc[1],wc[2]]);
            if (!tri) continue;
            if (tri.n[1] > 0.7) continue;
            if (user.y > tri.yMax || user.y + h < tri.yMin) continue;
            if (this._circleIntersectsTri(user.x, user.z, user.getRadius(), tri)) return true;
        }
        return false;
    }

    // --- Private: static-only floor/ceiling (used by platform riding Y clamp) ---

    _getStaticFloor(px, pz, r) {
        let maxY = -Infinity;
        const check = (tri) => {
            if (!this._aabbXZ(px, pz, r, tri)) return;
            if (!this._circleIntersectsTri(px, pz, r, tri)) return;
            const y = (tri.d - tri.n[0]*px - tri.n[2]*pz) / tri.n[1];
            if (y > maxY) maxY = y;
        };
        for (const sc of this._static) sc.floors.forEach(check);
        return maxY;
    }

    _getStaticCeiling(px, pz, r, headY) {
        let minY = Infinity;
        const check = (tri) => {
            if (!this._aabbXZ(px, pz, r, tri)) return;
            if (!this._circleIntersectsTri(px, pz, r, tri)) return;
            const y = (tri.d - tri.n[0]*px - tri.n[2]*pz) / tri.n[1];
            if (y > headY && y < minY) minY = y;
        };
        for (const sc of this._static) sc.ceilings.forEach(check);
        return minY;
    }

    // --- Private: broadphase ---

    _broadphaseXZ(px, pz, r, dc) {
        const dx = px - dc.centerWorld[0], dz = pz - dc.centerWorld[2];
        return Math.sqrt(dx*dx + dz*dz) <= r + dc.bRadius;
    }

    // --- Private: 2D XZ geometry ---

    _aabbXZ(px, pz, r, tri) {
        return px + r >= tri.xMin && px - r <= tri.xMax
            && pz + r >= tri.zMin && pz - r <= tri.zMax;
    }

    _aabbXZSweep(cx, cz, vx, vz, r, tri) {
        const minX = Math.min(cx, cx+vx) - r, maxX = Math.max(cx, cx+vx) + r;
        const minZ = Math.min(cz, cz+vz) - r, maxZ = Math.max(cz, cz+vz) + r;
        return maxX >= tri.xMin && minX <= tri.xMax
            && maxZ >= tri.zMin && minZ <= tri.zMax;
    }

    _cross2D(ux, uz, vx, vz) {
        return ux * vz - uz * vx;
    }

    _distToSegment(px, pz, ax, az, bx, bz) {
        const dx = bx - ax, dz = bz - az;
        const len2 = dx*dx + dz*dz;
        if (len2 < 1e-10) return Math.sqrt((px-ax)**2 + (pz-az)**2);
        const t = Math.max(0, Math.min(1, ((px-ax)*dx + (pz-az)*dz) / len2));
        return Math.sqrt((px-ax-t*dx)**2 + (pz-az-t*dz)**2);
    }

    _circleIntersectsTri(px, pz, r, tri) {
        const [A, B, C] = tri.pts;
        const d0 = this._cross2D(B[0]-A[0], B[2]-A[2], px-A[0], pz-A[2]);
        const d1 = this._cross2D(C[0]-B[0], C[2]-B[2], px-B[0], pz-B[2]);
        const d2 = this._cross2D(A[0]-C[0], A[2]-C[2], px-C[0], pz-C[2]);
        if ((d0>=0 && d1>=0 && d2>=0) || (d0<=0 && d1<=0 && d2<=0)) return true;
        return this._distToSegment(px, pz, A[0],A[2], B[0],B[2]) < r
            || this._distToSegment(px, pz, B[0],B[2], C[0],C[2]) < r
            || this._distToSegment(px, pz, C[0],C[2], A[0],A[2]) < r;
    }

    _sweptCircleVsSegment(cx, cz, vx, vz, ax, az, bx, bz, r) {
        const sdx = bx - ax, sdz = bz - az;
        const slen = Math.sqrt(sdx*sdx + sdz*sdz);
        if (slen < 1e-10) return this._sweptCircleVsPoint(cx, cz, vx, vz, ax, az, r);

        const nix = -sdz / slen, niz = sdx / slen;
        const dist = nix * (cx - ax) + niz * (cz - az);
        const vn   = nix * vx + niz * vz;
        if (Math.abs(vn) > 1e-10) {
            const sn = dist >= 0 ? 1 : -1;
            const t  = (sn * r - dist) / vn;
            if (t >= 0 && t <= 1) {
                const s = (cx + t*vx - ax) * (sdx/slen) + (cz + t*vz - az) * (sdz/slen);
                if (s >= 0 && s <= slen) return { t, nx: sn * nix, nz: sn * niz };
            }
        }

        const ra = this._sweptCircleVsPoint(cx, cz, vx, vz, ax, az, r);
        const rb = this._sweptCircleVsPoint(cx, cz, vx, vz, bx, bz, r);
        if (ra && rb) return ra.t < rb.t ? ra : rb;
        return ra || rb;
    }

    _sweptCircleVsPoint(cx, cz, vx, vz, sx, sz, r) {
        const a = vx*vx + vz*vz;
        if (a < 1e-10) return null;
        const b    = 2 * (vx*(cx-sx) + vz*(cz-sz));
        const c    = (cx-sx)**2 + (cz-sz)**2 - r*r;
        const disc = b*b - 4*a*c;
        if (disc < 0) return null;
        const t = (-b - Math.sqrt(disc)) / (2*a);
        if (t < 0 || t > 1) return null;
        const hx = cx + t*vx - sx, hz = cz + t*vz - sz;
        const hlen = Math.sqrt(hx*hx + hz*hz);
        if (hlen < 1e-10) return null;
        return { t, nx: hx/hlen, nz: hz/hlen };
    }
}
