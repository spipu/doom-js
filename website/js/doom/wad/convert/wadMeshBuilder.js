/**
 * Mesh construction helpers (transposition of add_wall_quad / add_flat_quad of
 * convert_wad.py) + texture index remapping and conversion to engine data.
 *
 * A mesh is {points: [[x,y,z]…], faces: […]} — same face format as the
 * .obj.json files (pts 1-based, color, texture GLOBAL 1-based bank index,
 * map, clampV, passableUser, passableEnemy, textures {ids, duration}).
 */
class WadMeshBuilder {
    static newMesh() {
        return {points: [], faces: []};
    }

    // USE-action radius of an instance mesh: half its XZ bounding diagonal
    // plus the action margin (DOOR_ACTION_RADIUS).
    static xzActionRadius(mesh) {
        const xs = mesh.points.map((p) => p[0]);
        const zs = mesh.points.map((p) => p[2]);
        const dx = Math.max(...xs) - Math.min(...xs);
        const dz = Math.max(...zs) - Math.min(...zs);

        return Math.sqrt(dx * dx + dz * dz) / 2.0 + WadConstants.DOOR_ACTION_RADIUS;
    }

    // Invisible trigger zone on a linedef, shared by the walk triggers, the
    // teleporters and the invisible USE switches: a one-point mesh (getCenter =
    // the zone centre) at the middle of the line, at player-centre height above
    // the front sector floor, with a radius spanning the whole line + margin.
    // The world segment comes back with it, for the consumers whose zone fires
    // on a CROSSING rather than on proximity (see WadLineCrossing) — they pass
    // their own, wider margin: reaching the line is a USE range, sampling the
    // approach to it is not.
    static buildLineZone(level, ld, margin = WadConstants.DOOR_ACTION_RADIUS) {
        const {vertexes, sidedefs, sectors} = level;
        const SCALE = WadConstants.SCALE;

        const [dx1, dy1] = vertexes[ld.v1];
        const [dx2, dy2] = vertexes[ld.v2];
        const fh = ((ld.right >= 0) ? sectors[sidedefs[ld.right].sector].fh : 0);
        const [wx1, wz1] = WadGeometry.doomToWorld(dx1, dy1);
        const [wx2, wz2] = WadGeometry.doomToWorld(dx2, dy2);
        const [cwx, cwz] = WadGeometry.doomToWorld((dx1 + dx2) / 2, (dy1 + dy2) / 2);
        const cwy = fh * SCALE + (WadConstants.PLAYER_HEIGHT / 2);
        const lenWorld = WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2) * SCALE;

        const mesh = WadMeshBuilder.newMesh();
        mesh.points.push([cwx, cwy, cwz]);

        return {
            mesh:    mesh,
            radius:  (lenWorld / 2) + margin,
            segment: [wx1, wz1, wx2, wz2]
        };
    }

    // Moving top flat of a sector (floor surface at origFh, normal up).
    // Shared by the lift and rising-floor builders; the stair builder keeps
    // its own raw-chains variant (see there).
    static addSectorTopFlat(mesh, level, bank, analysis, si, origFh) {
        const sec = level.sectors[si];
        const ft = bank.ensureFlatTex(sec.ft);
        if (ft < 0) {
            return;
        }
        WadMeshBuilder.addSectorFlat(mesh, level, ft, si, origFh, true, sec.light,
            {lightGroup: WadMapAnalyzer.lightGroupOf(analysis, si)});
    }

    /**
     * Full floor or ceiling flat of a sector: the BSP subsector fans when the
     * level carries a usable tree (correct even on UNCLOSED sectors, and a
     * ring's inner void simply has no subsector — no holes needed), else the
     * linedef-chain polygons with their holes (the fallback also nets the rare
     * sector the carve dropped to epsilon).
     */
    static addSectorFlat(mesh, level, texIdx, si, yHeight, isFloor, light, options = {}) {
        const lightGroup = (options.lightGroup ?? null);
        const uScroll    = (options.uScroll ?? 0);
        const collisionOnly = (options.collisionOnly === true);

        const bspPolys = ((level.bspTree ?? null) !== null) ? level.bspTree.polysOfSector(si) : [];
        if (bspPolys.length > 0) {
            for (const poly of bspPolys) {
                WadMeshBuilder.addConvexFlat(mesh, texIdx, poly, yHeight, isFloor, light, lightGroup, uScroll, collisionOnly);
            }
            return;
        }
        const {vertexes, linedefs, sidedefs} = level;
        for (const p of WadSectorPolygons.outersWithHoles(si, linedefs, sidedefs, vertexes)) {
            WadMeshBuilder.addFlatQuad(mesh, texIdx, p.outer, yHeight, isFloor, light, p.holes, lightGroup, uScroll, collisionOnly);
        }
    }

    /**
     * One CONVEX flat polygon fanned from its first vertex ((numlines - 2)
     * triangles, GZDoom hw_vertexbuilder) — the per-subsector path, no
     * triangulator involved.
     */
    static addConvexFlat(mesh, texIdx, convexPolyDoom, yHeight, isFloor, light = 128, lightGroup = null, uScrollUvPerSec = 0, collisionOnly = false) {
        if (convexPolyDoom.length < 3) {
            return;
        }
        const o = WadMeshBuilder._orientFlat(
            convexPolyDoom.map((v) => WadGeometry.doomToWorld(v[0], v[1])), convexPolyDoom);
        const tris = [];
        for (let i = 1; i < o.xz.length - 1; i++) {
            tris.push([0, i, i + 1]);
        }
        WadMeshBuilder._emitFlatFaces(mesh, texIdx, o.xz, o.poly, tris, yHeight, isFloor, light, lightGroup, uScrollUvPerSec, collisionOnly);
    }

    // Flat winding convention (triangulate() and the fans expect it): reverse
    // a counter-clockwise world-XZ polygon, keeping the Doom-coord twin in step.
    static _orientFlat(xz, polyDoom) {
        if (WadGeometry.polygonAreaSign(xz) <= 0) {
            return {xz: xz, poly: polyDoom};
        }

        return {xz: [...xz].reverse(), poly: [...polyDoom].reverse()};
    }

    /**
     * Append a textured wall quad (two triangles) to the mesh.
     * flip=false → front face (normal on the right-hand side of v1→v2).
     * flip=true  → back face. yOff is the pixel offset from the top of the texture.
     *
     * @param {object} mesh
     * @param {int}    texIdx - GLOBAL 0-based bank index, or -1 (face without texture)
     * @param {object} options - {xOff, yOff, flip, light, clampV, passableUser, passableEnemy, collisionOnly, passableShot, uScrollTexelsPerSec, lightGroup}
     */
    static addWallQuad(mesh, texIdx, x1, z1, x2, z2, yBot, yTop, wallLenDoom, texW, texH, options) {
        options = options ?? {};
        const xOff          = options.xOff ?? 0;
        const yOff          = options.yOff ?? 0;
        const flip          = (options.flip === true);
        const light         = options.light ?? 128;
        const clampV        = (options.clampV === true);
        const passableUser  = (options.passableUser === true);
        const passableEnemy = (options.passableEnemy === true);
        const collisionOnly = (options.collisionOnly === true);
        const passableShot  = (options.passableShot === true);
        const uScrollTexels = options.uScrollTexelsPerSec ?? 0;
        const lightGroup    = options.lightGroup ?? null;

        if (yBot >= yTop) {
            return;
        }
        if (texW <= 0 || texH <= 0) {
            return;
        }

        const u0 = xOff / texW;
        const u1 = (xOff + wallLenDoom) / texW;
        const hDoom = (yTop - yBot) / WadConstants.SCALE;
        const vt = 1.0 - yOff / texH;
        const vb = 1.0 - (yOff + hDoom) / texH;

        // 4 vertices: bottom-left, bottom-right, top-right, top-left
        const i = mesh.points.length;
        mesh.points.push([x1, yBot, z1]);
        mesh.points.push([x2, yBot, z2]);
        mesh.points.push([x2, yTop, z2]);
        mesh.points.push([x1, yTop, z1]);

        const c = Math.trunc(light);

        // One fresh color array per face: the engine fcAdd normalizes the
        // array in place, a shared array would be normalized several times
        const buildFace = (ptsList, mapList) => {
            const face = {pts: ptsList, color: [c, c, c]};
            if (texIdx >= 0) {
                face.texture = texIdx + 1;
                face.map     = mapList;
            }
            if (clampV) {
                face.clampV = true;
            }
            if (passableUser) {
                face.passableUser = true;
            }
            if (passableEnemy) {
                face.passableEnemy = true;
            }
            if (collisionOnly) {
                face.collisionOnly = true;
            }
            if (passableShot) {
                face.passableShot = true;
            }
            if (uScrollTexels !== 0 && texIdx >= 0) {
                // Texel rate → UV fraction per second (the texture width lives here)
                face.uvScroll = {u: uScrollTexels / texW, v: 0};
            }
            if (lightGroup !== null) {
                face.lightGroup = lightGroup;
            }

            return face;
        };

        if (!flip) {
            // flip=false: viewer on left of v1→v2, so v1 is to viewer's right → u reversed
            mesh.faces.push(buildFace([i + 1, i + 2, i + 3], [[u1, vb], [u0, vb], [u0, vt]]));
            mesh.faces.push(buildFace([i + 1, i + 3, i + 4], [[u1, vb], [u0, vt], [u1, vt]]));
        } else {
            mesh.faces.push(buildFace([i + 1, i + 3, i + 2], [[u0, vb], [u1, vt], [u1, vb]]));
            mesh.faces.push(buildFace([i + 1, i + 4, i + 3], [[u0, vb], [u0, vt], [u1, vt]]));
        }
    }

    /**
     * Triangulate and append a floor or ceiling polygon to the mesh.
     * polyVerts2d: [[doomX, doomY]…]. Flat UV tiles every 64 Doom units.
     *
     * @param {object}     mesh
     * @param {int}        texIdx - GLOBAL 0-based bank index
     * @param {number[][]} polyVerts2d
     * @param {number}     yHeight - in Doom units
     * @param {boolean}    isFloor
     * @param {number}     light
     * @param {number[][][]|null} holes
     * @param {int|null}   lightGroup
     * @param {number}     uScrollUvPerSec  UV drift of the flat per second
     *                     (scrolling lava/conveyor floors; 0 = static)
     * @param {boolean}    collisionOnly - solid but never drawn (sky floors:
     *                     the cylindrical sky shows through)
     */
    static addFlatQuad(mesh, texIdx, polyVerts2d, yHeight, isFloor, light = 128, holes = null, lightGroup = null, uScrollUvPerSec = 0, collisionOnly = false) {
        if (polyVerts2d.length < 3) {
            return;
        }

        let xz = polyVerts2d.map((v) => WadGeometry.doomToWorld(v[0], v[1]));
        let polyLocal = [...polyVerts2d];
        let preTris   = null;

        // Holes: merge via bridge cuts then ear-clip. The legacy ear-clipping is
        // kept whenever it triangulates the merged polygon COMPLETELY (true
        // count = merged.length - 2), so those sectors keep a byte-identical
        // mesh. When it leaves the flat incomplete (complex donuts with many
        // holes whose bridges tangle), fall back to the robust earcut path with
        // native hole support — otherwise the missing triangles show as holes in
        // both the floor and the ceiling (same merged polygon feeds both).
        if (holes && holes.length > 0) {
            const merged = WadTriangulator.mergeHolesIntoPolygon(polyLocal, holes);
            const o = WadMeshBuilder._orientFlat(
                merged.map((v) => WadGeometry.doomToWorld(v[0], v[1])), merged);
            const legacyTris = WadTriangulator.triangulate(o.xz);
            if (legacyTris.length >= o.xz.length - 2) {
                polyLocal = o.poly;
                xz        = o.xz;
                preTris   = legacyTris;
            } else {
                const outerXz = polyVerts2d.map((v) => WadGeometry.doomToWorld(v[0], v[1]));
                const holesXz = holes.map((h) => h.map((v) => WadGeometry.doomToWorld(v[0], v[1])));
                const ec = WadTriangulator.triangulateWithHoles(outerXz, holesXz);
                const holeVertsDoom = [];
                for (const h of holes) {
                    for (const v of h) {
                        holeVertsDoom.push(v);
                    }
                }
                polyLocal = [...polyVerts2d, ...holeVertsDoom];
                xz        = ec.vertices;
                preTris   = ec.tris;
            }
        }

        // Simple polygon path: triangulate() requires CCW winding, reverse CW
        // polygons. Skipped when the holes path above already produced preTris.
        if (preTris === null) {
            const o = WadMeshBuilder._orientFlat(xz, polyLocal);
            xz        = o.xz;
            polyLocal = o.poly;
            const legacyTris = WadTriangulator.triangulate(xz);
            if (legacyTris.length >= xz.length - 2) {
                preTris = legacyTris;
            } else {
                const ec = WadTriangulator.triangulateWithHoles(xz, null);
                xz      = ec.vertices;
                preTris = ec.tris;
            }
        }

        WadMeshBuilder._emitFlatFaces(mesh, texIdx, xz, polyLocal, preTris, yHeight, isFloor, light, lightGroup, uScrollUvPerSec, collisionOnly);
    }

    // Shared emitter of triangulated flat faces (points, UVs, winding, flags)
    // — fed by addFlatQuad (chain polygons) and addConvexFlat (BSP fans).
    static _emitFlatFaces(mesh, texIdx, xz, polyLocal, tris, yHeight, isFloor, light, lightGroup, uScrollUvPerSec, collisionOnly) {
        const c = Math.trunc(light);
        const base = mesh.points.length;
        for (const [x, z] of xz) {
            mesh.points.push([x, yHeight * WadConstants.SCALE, z]);
        }

        // Vanilla maps flats as v = -y/64 (R_MapPlane); Object3d.fcAdd flips V
        // (1 - v) at load, so the vanilla minus is authored as +y here.
        const flatUv = (idx) => [polyLocal[idx][0] / 64.0, polyLocal[idx][1] / 64.0];

        for (const [a, b, cIdx] of tris) {
            // CCW polygon → floors swap [a,b,c] to [a,c,b] for an upward normal
            const order = ((isFloor) ? [a, cIdx, b] : [a, b, cIdx]);
            const face  = {
                pts:   order.map((idx) => (base + idx + 1)),
                color: [c, c, c]
            };
            if (texIdx >= 0) {
                face.texture = texIdx + 1;
                face.map     = order.map(flatUv);
            }
            if (lightGroup !== null) {
                face.lightGroup = lightGroup;
            }
            if (uScrollUvPerSec !== 0) {
                face.uvScroll = {u: uScrollUvPerSec, v: 0};
            }
            if (collisionOnly) {
                face.collisionOnly = true;
            }
            mesh.faces.push(face);
        }
    }

    /**
     * Remap the GLOBAL 1-based texture indices of the faces to LOCAL 1-based
     * indices, in place. Extra global indices (1-based) can be appended to the
     * local list without being referenced by any face (switch SW2 textures).
     *
     * @param {object[]} faces
     * @param {int[]}    extraGlobalOneBased
     * @returns {int[]} local texture list as GLOBAL 0-based bank indices
     */
    static remapLocalTextures(faces, extraGlobalOneBased = []) {
        const usedGlobal = new Set();
        for (const face of faces) {
            if (face.texture !== undefined) {
                usedGlobal.add(face.texture);
            }
        }
        for (const g of extraGlobalOneBased) {
            usedGlobal.add(g);
        }

        const sortedGlobal = [...usedGlobal].sort((a, b) => a - b);
        const gToLocal = {};
        for (let i = 0; i < sortedGlobal.length; i++) {
            gToLocal[sortedGlobal[i]] = i + 1;
        }

        for (const face of faces) {
            if (face.texture !== undefined) {
                face.texture = gToLocal[face.texture];
            }
        }

        return sortedGlobal.map((g) => g - 1);
    }

    /**
     * Replace static 'texture' by animated 'textures' on the faces matching the
     * animation map (local 1-based indices), in place.
     */
    static applyAnimMap(faces, animMap) {
        for (const face of faces) {
            const idx = face.texture;
            if (idx !== undefined && animMap[idx] !== undefined) {
                face.textures = animMap[idx];
                delete face.texture;
            }
        }
    }

    /**
     * Convert a mesh + local texture list (bank indices) into the data format
     * of Object3dLoader.loadFromData (textures as engine loader ids).
     *
     * @param {int[]}          localIndices - GLOBAL 0-based bank indices
     * @param {object}         mesh
     * @param {WadTextureBank} bank
     */
    static toLoaderData(localIndices, mesh, bank) {
        return {
            textures: localIndices.map((bankIndex) => bank.getLoaderId(bankIndex)),
            points:   mesh.points,
            faces:    mesh.faces
        };
    }
}
