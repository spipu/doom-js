/**
 * Rising floor instances builder: a floor that moves UP toward its target
 * (one-way) when its walk-trigger zone or switch fires. Mirrors WadLiftBuilder,
 * but the static floor is NOT patched down — the moving top-flat sits at the
 * WAD floor height (origFh) and rises by +delta, where delta comes from the
 * target computed in the analysis (fixed +24/+32, lowest surrounding ceiling,
 * or next-higher floor — vanilla rules, see FLOOR_UP_BY_SPECIAL). A staged
 * floor (risingFloorStaging) spans its whole travel in one timeline; each
 * trigger drives it up to its own target (Instance.startUntilVerticalDelta).
 * The riser is built as a "skirt" from origFh-delta to origFh: hidden below
 * the adjacent corridor floor at rest, it emerges as the step once the floor
 * has risen.
 * The skirt covers EVERY two-sided edge, a shared edge with another rising
 * floor included (E2M2's blood platforms stop at different heights) — see
 * AbstractMoverBuilder._buildRisers.
 */
class WadRisingFloorBuilder extends AbstractMoverBuilder {
    _sectorIds() {
        return this._analysis.risingFloorIds;
    }

    _buildOne(si) {
        const sec     = this._level.sectors[si];
        const special = this._analysis.risingFloorSpecial[si] ?? 58;
        const origFh  = sec.fh;
        // Travel toward the target computed in the analysis (vanilla rules).
        const targetFh = this._analysis.risingFloorTargetFh[si] ?? (origFh + 24);
        const delta    = targetFh - origFh;
        // Skirt base: where the riser starts so that, fully raised, it covers
        // exactly the origFh → targetFh step.
        const baseFh   = origFh - delta;

        const floorName = this._analysis.floorMovers.get(si).code;
        const mesh = WadMeshBuilder.newMesh();

        WadMeshBuilder.addSectorTopFlat(mesh, this._level, this._bank, this._analysis, si, origFh);
        this._buildRisers(mesh, si, origFh, baseFh, floorName);

        const textures = this._meshTextures(mesh);
        if (textures === null) {
            return null;
        }

        return {
            code:         floorName,
            textures:     textures,
            mesh:         mesh,
            instanceData: this._buildInstanceData(floorName, special, delta, this._analysis.risingFloorInstantIds.has(si))
        };
    }

    _buildInstanceData(floorName, special, delta, instant = false) {
        const travelY = delta * WadConstants.SCALE;

        // One-way, upward. Driven externally (walk-trigger zone or switch),
        // never by self-proximity. onlyOnce stays true even for WR/SR specials:
        // a one-way floor that reached its last target must not replay from
        // the start; the repeatable part lives on the zone/switch, whose extra
        // start() calls are harmless (idempotent).
        let keyframes;
        if (instant) {
            // Vanilla instant-raise (EV_DoFloor lower toward a destination
            // ABOVE the floor: T_MovePlane jumps to it on the first tic) —
            // the pop-up bridge trick. One tic, no walk-up pre-frame.
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
            code:              floorName,
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
