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
