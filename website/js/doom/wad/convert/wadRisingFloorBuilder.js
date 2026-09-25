/**
 * Rising floor instances builder: a one-way floor rising from its WAD height
 * to the analysis target. A staged floor spans its whole travel in one
 * timeline, each trigger stopping it at its own target. The riser is a skirt
 * from origFh - delta to origFh, buried at rest, on every two-sided edge (E2M2's
 * neighbouring platforms stop at different heights).
 */
class WadRisingFloorBuilder extends AbstractMoverBuilder {
    _sectorIds() {
        return this._analysis.risingFloorIds;
    }

    _buildOne(si) {
        const sec      = this._level.sectors[si];
        const special  = this._analysis.risingFloorSpecial[si] ?? 58;
        const origFh   = sec.fh;
        const targetFh = this._analysis.risingFloorTargetFh[si] ?? (origFh + 24);
        const delta    = targetFh - origFh;
        // Fully raised, the skirt covers exactly the origFh → targetFh step.
        const baseFh   = origFh - delta;

        const floorCode = this._analysis.floorMovers.get(si).code;
        const mesh = WadMeshBuilder.newMesh();

        WadMeshBuilder.addSectorTopFlat(mesh, this._level, this._bank, this._analysis, si, origFh);
        this._buildRisers(mesh, si, origFh, baseFh, floorCode);

        const textures = this._meshTextures(mesh);
        if (textures === null) {
            return null;
        }

        return {
            code:         floorCode,
            textures:     textures,
            mesh:         mesh,
            instanceData: this._buildInstanceData(floorCode, special, delta, this._analysis.risingFloorInstantIds.has(si))
        };
    }

    _buildInstanceData(floorCode, special, delta, instant = false) {
        const travelY = delta * WadConstants.SCALE;

        // onlyOnce even for WR/SR: a floor at its last target must not replay
        // from the start; the trigger carries the repeat.
        let keyframes;
        if (instant) {
            // Instant raise: T_MovePlane reaches a destination above a lowering
            // floor on the first tic (pop-up bridge).
            keyframes = [
                {t: 0.0,                          translate: [0, 0, 0],       rotate: [0, 0, 0]},
                {t: WadConstants.SECONDS_PER_TIC, translate: [0, travelY, 0], rotate: [0, 0, 0]}
            ];
        } else {
            const speed = WadConstants.FLOOR_UP_BY_SPECIAL[special].speed;
            keyframes = WadConstants.raiseLegKeyframes(0, travelY, WadConstants.moveDurationS(delta, speed));
        }

        const press = WadConstants.floorUpPressProfile(special);

        return {
            code:              floorCode,
            position:          [0, 0, 0],
            rotation:          [0, 0, 0],
            trigger:           'none',
            loop:              false,
            onlyOnce:          true,
            collisionShape:    'faces',
            interactionRadius: null,
            damage:            null,
            ...WadConstants.pressCycleFields(press),
            keyframes:         keyframes
        };
    }
}
