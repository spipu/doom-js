/**
 * Base of the mover-instance builders (doors, lifts, rising floors, stairs).
 * They all turn a SET of sector ids resolved by the analyzer into one engine
 * instance per sector, and they all finish a mesh the same way — only the
 * geometry and the keyframes differ, which is what the subclasses provide.
 */
class AbstractMoverBuilder {
    /**
     * @param {object}           level
     * @param {object}           analysis
     * @param {WadTextureBank}   bank
     * @param {WadAnimationBank} animBank
     */
    constructor(level, analysis, bank, animBank) {
        this._level    = level;
        this._analysis = analysis;
        this._bank     = bank;
        this._animBank = animBank;
    }

    /**
     * One built mover per sector, in ascending sector order — the instance
     * codes are part of the save format (a rebuilt level must name them the
     * same way), so the order may not depend on a Set's iteration.
     *
     * @returns {object[]} [{code, textures (bank indices), mesh, instanceData}]
     */
    buildAll() {
        const result = [];
        for (const si of [...this._sectorIds()].sort((a, b) => (a - b))) {
            const built = this._buildOne(si);
            if (built !== null) {
                result.push(built);
            }
        }

        return result;
    }

    /**
     * Texture list of a finished mesh: the global bank indices are remapped to
     * the instance's own list and the animation groups are applied in place.
     * null when the geometry came out empty — the sector then has no mover at
     * all (a lift with nowhere to go, a step whose neighbour owns every riser).
     *
     * @returns {int[]|null}
     */
    _meshTextures(mesh) {
        if (mesh.points.length === 0) {
            return null;
        }
        const groups = this._animBank.buildAnimGroups(WadMeshBuilder.remapLocalTextures(mesh.faces));
        WadMeshBuilder.applyAnimMap(mesh.faces, groups.animMap);

        return groups.newList;
    }

    // Riser (riserBaseFh → origFh) on EVERY two-sided edge: the mover is a
    // self-contained box, so two adjacent movers at different heights keep a
    // wall between them. Texture: neighbour lower, else own lower, else a
    // sibling edge's (two passes). One-sided edges belong to the static map.
    // A lower-unpegged texture is anchored to the ceiling in vanilla, hence
    // pinned to the world while the riser moves (uvAnchor).
    _buildRisers(mesh, si, origFh, riserBaseFh, moverCode) {
        const {vertexes, linedefs, sidedefs, sectors} = this._level;
        const SCALE = WadConstants.SCALE;

        // A usable lower texture name on a sidedef, or null.
        const validLower = (sd) => {
            if (!sd || !sd.lower || sd.lower === '-') {
                return null;
            }
            return ((this._bank.ensureWallTex(sd.lower) >= 0) ? sd.lower : null);
        };

        const edges = [];
        let fallbackTex = null;

        for (const ld of linedefs) {
            if (ld.right < 0 || ld.left < 0) {
                continue;
            }
            const rSi2 = sidedefs[ld.right].sector;
            const lSi2 = sidedefs[ld.left].sector;
            const moverOnRight = (rSi2 === si);
            const moverOnLeft  = (lSi2 === si);
            if (!moverOnRight && !moverOnLeft) {
                continue;
            }

            const ownSd        = sidedefs[((moverOnRight) ? ld.right : ld.left)];
            const neighbourSd  = sidedefs[((moverOnRight) ? ld.left : ld.right)];
            const neighbourSec = sectors[((moverOnRight) ? lSi2 : rSi2)];

            // Texture: neighbour lower first, then own lower. Record the source
            // sidedef (for xo/yo) and its sector (for light/ch). null = bare edge.
            let tex    = validLower(neighbourSd);
            let srcSd  = neighbourSd;
            let srcSec = neighbourSec;
            let srcSi  = ((moverOnRight) ? lSi2 : rSi2);
            if (tex === null) {
                tex    = validLower(ownSd);
                srcSd  = ownSd;
                srcSec = sectors[si];
                srcSi  = si;
            }
            if ((tex !== null) && (fallbackTex === null)) {
                fallbackTex = tex;
            }

            const [dx1, dy1] = vertexes[ld.v1];
            const [dx2, dy2] = vertexes[ld.v2];
            const [wx1, wz1] = WadGeometry.doomToWorld(dx1, dy1);
            const [wx2, wz2] = WadGeometry.doomToWorld(dx2, dy2);
            edges.push({
                tex, srcSd, srcSec, srcSi,
                wx1, wz1, wx2, wz2,
                wallLen: WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2),
                lowerUnpeg: ((ld.flags & WadConstants.ML_DONTPEGBOTTOM) !== 0),
                flip: !moverOnRight
            });
        }

        for (const e of edges) {
            const tex = ((e.tex !== null) ? e.tex : fallbackTex);
            if (tex === null) {
                continue;   // no texture anywhere on this mover — skip (very rare)
            }
            const ti = this._bank.ensureWallTex(tex);
            if (ti < 0) {
                continue;
            }
            const {width: tw, height: th} = this._bank.getDims(ti);
            const yo = e.srcSd.yo + ((e.lowerUnpeg) ? (e.srcSec.ch - origFh) : 0);
            WadMeshBuilder.addWallQuad(mesh, ti,
                e.wx1, e.wz1, e.wx2, e.wz2,
                riserBaseFh * SCALE, origFh * SCALE,
                e.wallLen, tw, th,
                {xOff: e.srcSd.xo, yOff: yo, flip: e.flip, light: e.srcSec.light, lightGroup: WadMapAnalyzer.lightGroupOf(this._analysis, e.srcSi),
                    uvAnchor: ((e.lowerUnpeg) ? WadConstants.wallTextureAnchor(moverCode, th, false) : null)});
        }
    }

    /**
     * Sector ids this builder turns into movers (from the analysis).
     *
     * @returns {Set<int>}
     */
    _sectorIds() {
        throw new Error('AbstractMoverBuilder: _sectorIds not implemented');
    }

    /**
     * One mover, or null when this sector yields none.
     *
     * @returns {object|null}
     */
    _buildOne(si) {
        throw new Error('AbstractMoverBuilder: _buildOne not implemented');
    }
}
