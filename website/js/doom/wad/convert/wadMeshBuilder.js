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

    /**
     * Append a textured wall quad (two triangles) to the mesh.
     * flip=false → front face (normal on the right-hand side of v1→v2).
     * flip=true  → back face. yOff is the pixel offset from the top of the texture.
     *
     * @param {object} mesh
     * @param {int}    texIdx - GLOBAL 0-based bank index, or -1 (face without texture)
     * @param {object} options - {xOff, yOff, flip, light, clampV, passableUser, passableEnemy, uScrollTexelsPerSec}
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
        const uScrollTexels = options.uScrollTexelsPerSec ?? 0;

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
            if (uScrollTexels !== 0 && texIdx >= 0) {
                // Texel rate → UV fraction per second (the texture width lives here)
                face.uvScroll = {u: uScrollTexels / texW, v: 0};
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
     */
    static addFlatQuad(mesh, texIdx, polyVerts2d, yHeight, isFloor, light = 128, holes = null) {
        if (polyVerts2d.length < 3) {
            return;
        }

        const c = Math.trunc(light);

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
            let merged   = WadTriangulator.mergeHolesIntoPolygon(polyLocal, holes);
            let xzMerged = merged.map((v) => WadGeometry.doomToWorld(v[0], v[1]));
            if (WadGeometry.polygonAreaSign(xzMerged) > 0) {
                xzMerged = [...xzMerged].reverse();
                merged   = [...merged].reverse();
            }
            const legacyTris = WadTriangulator.triangulate(xzMerged);
            if (legacyTris.length >= xzMerged.length - 2) {
                polyLocal = merged;
                xz        = xzMerged;
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
            if (WadGeometry.polygonAreaSign(xz) > 0) {
                xz        = [...xz].reverse();
                polyLocal = [...polyLocal].reverse();
            }
            const legacyTris = WadTriangulator.triangulate(xz);
            if (legacyTris.length >= xz.length - 2) {
                preTris = legacyTris;
            } else {
                const ec = WadTriangulator.triangulateWithHoles(xz, null);
                xz      = ec.vertices;
                preTris = ec.tris;
            }
        }

        const base = mesh.points.length;
        for (const [x, z] of xz) {
            mesh.points.push([x, yHeight * WadConstants.SCALE, z]);
        }

        const tris = preTris;

        const flatUv = (idx) => [polyLocal[idx][0] / 64.0, -polyLocal[idx][1] / 64.0];

        for (const [a, b, cIdx] of tris) {
            if (isFloor) {
                // CCW polygon → swap [a,b,c] to [a,c,b] for an upward-facing normal
                mesh.faces.push({
                    pts:     [base + a + 1, base + cIdx + 1, base + b + 1],
                    color:   [c, c, c],
                    texture: texIdx + 1,
                    map:     [flatUv(a), flatUv(cIdx), flatUv(b)]
                });
            } else {
                mesh.faces.push({
                    pts:     [base + a + 1, base + b + 1, base + cIdx + 1],
                    color:   [c, c, c],
                    texture: texIdx + 1,
                    map:     [flatUv(a), flatUv(b), flatUv(cIdx)]
                });
            }
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
