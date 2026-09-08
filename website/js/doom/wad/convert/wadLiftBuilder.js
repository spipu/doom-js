/**
 * Lift / moving floor instances builder (transposition of the lift generation
 * phase of convert_wad.py main()).
 */
class WadLiftBuilder extends AbstractMoverBuilder {
    _sectorIds() {
        return this._analysis.movingFloorDownIds;
    }

    _buildOne(si) {
        const {liftOriginalFh, liftMinAdjFh, liftBaseTargetFh, liftMaxAdjFh, liftSectorSpecial} = this._analysis;
        const origFh = liftOriginalFh[si];
        // minFh = lowest point of ANY cycle (static patch, skirt); the base
        // cycle itself travels to its own special's destination.
        const minFh  = liftMinAdjFh[si];
        const baseFh = liftBaseTargetFh[si] ?? minFh;

        // High end of the travel: origFh for ordinary lifts (they never rise
        // above their rest position), highest surrounding floor for perpetual
        // plats (which may start at their LOW end and travel upward).
        const isPerpetual = WadConstants.FLOOR_PERPETUAL_SPECIALS.has(liftSectorSpecial[si]);
        const maxFh = ((isPerpetual) ? liftMaxAdjFh[si] : origFh);

        if (maxFh <= minFh) {
            return null;
        }

        const liftName = 'lift_' + si;
        const mesh = WadMeshBuilder.newMesh();

        WadMeshBuilder.addSectorTopFlat(mesh, this._level, this._bank, this._analysis, si, origFh);
        // The riser band must span the full travel amplitude: when the plat
        // sits at its highest point (maxFh, or a raise-cycle top above it),
        // its skirt still has to reach down to minFh.
        const raiseTops  = Object.values(this._analysis.liftRaiseVariants[si] ?? {}).map((r) => r.targetFh);
        const highestFh  = Math.max(maxFh, ...raiseTops);
        this._buildRisers(mesh, si, origFh, origFh - (highestFh - minFh), liftName);
        this._buildFloorPeggedWalls(mesh, si, origFh, origFh - minFh);

        const textures = this._meshTextures(mesh);
        if (textures === null) {
            return null;
        }

        return {
            code:         liftName,
            textures:     textures,
            mesh:         mesh,
            instanceData: this._buildInstanceData(liftName, si, origFh, baseFh, maxFh, mesh)
        };
    }

    _buildInstanceData(liftName, si, origFh, minFh, maxFh, mesh) {
        const special = this._analysis.liftSectorSpecial[si] ?? 88;
        const floor   = WadConstants.FLOOR_DOWN_BY_SPECIAL[special];
        const speed   = floor.speed;

        const radius = WadMeshBuilder.xzActionRadius(mesh);

        const travelY = (origFh - minFh) * WadConstants.SCALE;
        const moveS   = WadConstants.moveDurationS(origFh - minFh, speed);
        const waitS   = WadConstants.LIFT_WAIT_TICS * WadConstants.SECONDS_PER_TIC;

        // Every floor-down element is driven externally (switch / walk zone),
        // never by self-proximity — the instance trigger is always 'none'.
        const anim     = floor.anim;
        const trigger  = 'none';
        const loop     = floor.loop;
        const onlyOnce = floor.onlyOnce;

        let keyframes;
        if (anim === 'perpetual') {
            // Looping cycle through the full low↔high amplitude, starting at
            // the rest position (down first, like most vanilla plats). Zero-
            // length segments (rest position AT an end of the travel) are
            // skipped to keep the keyframes strictly increasing.
            const relLow  = -(origFh - minFh) * WadConstants.SCALE;
            const relHigh = (maxFh - origFh) * WadConstants.SCALE;
            const downS   = WadConstants.moveDurationS(origFh - minFh, speed);
            const fullS   = WadConstants.moveDurationS(maxFh - minFh, speed);
            const topS    = WadConstants.moveDurationS(maxFh - origFh, speed);
            let t = 0.0;
            keyframes = [{t: t, translate: [0, 0, 0], rotate: [0, 0, 0]}];
            if (downS > 0) {
                t += downS;
                keyframes.push({t: t, translate: [0, relLow, 0], rotate: [0, 0, 0]});
            }
            t += waitS;
            keyframes.push({t: t, translate: [0, relLow, 0], rotate: [0, 0, 0]});
            t += fullS;
            keyframes.push({t: t, translate: [0, relHigh, 0], rotate: [0, 0, 0]});
            t += waitS;
            keyframes.push({t: t, translate: [0, relHigh, 0], rotate: [0, 0, 0]});
            if (topS > 0) {
                t += topS;
                keyframes.push({t: t, translate: [0, 0, 0], rotate: [0, 0, 0]});
            }
        } else {
            keyframes = WadLiftBuilder._liftKeyframes(anim, 0, -travelY, moveS, waitS);
        }

        return {
            code:              liftName,
            position:          [0, 0, 0],
            rotation:          [0, 0, 0],
            trigger:           trigger,
            loop:              loop,
            onlyOnce:          onlyOnce,
            collisionShape:    'faces',
            interactionRadius: ((trigger === 'none') ? null : radius),
            damage:            null,
            // Lift blocked while rising = go back down and re-wait (T_PlatRaise)
            ...WadConstants.pressCycleFields(WadConstants.floorDownPressProfile(anim)),
            keyframes:         keyframes,
            keyframeVariants:  this._buildVariants(si, origFh, minFh, anim, speed, waitS),
            defaultVariant:    null
        };
    }

    // Named cycles of the lift: the raise pairs and the other lower specials
    // aimed at it, null when it has none.
    _buildVariants(si, origFh, minFh, anim, speed, waitS) {
        const variants = {
            ...(this._buildRaiseVariants(si, origFh, minFh, anim, speed, waitS) ?? {}),
            ...(this._buildLowerVariants(si, origFh, waitS) ?? {})
        };

        return ((Object.keys(variants).length > 0) ? variants : null);
    }

    // One cycle per other lower special (analysis.liftLowerVariants): its own
    // shape, speed and destination, replayed from the rest pose.
    _buildLowerVariants(si, origFh, waitS) {
        const lowers = this._analysis.liftLowerVariants[si];
        if (lowers === undefined) {
            return null;
        }
        const SCALE = WadConstants.SCALE;
        const variants = {};
        for (const [key, lower] of Object.entries(lowers)) {
            const moveS = WadConstants.moveDurationS(origFh - lower.targetFh, lower.speed);
            variants[key] = {
                keyframes: WadLiftBuilder._liftKeyframes(lower.anim, 0, -(origFh - lower.targetFh) * SCALE, moveS, waitS),
                onlyOnce:  lower.onlyOnce,
                loop:      false,
                ...WadConstants.pressCycleFields(WadConstants.floorDownPressProfile(lower.anim))
            };
        }

        return variants;
    }

    // Timeline of the lift's own shape between two poses: a one-way lower
    // stays at the low end, a round-trip waits there and comes back up. The
    // base cycle runs it on 0 ↔ −travel, a ':then' cycle on the raised span.
    static _liftKeyframes(anim, topY, lowY, moveS, waitS) {
        if (anim === 'one-way') {
            return [
                {t: 0.0,   translate: [0, topY, 0], rotate: [0, 0, 0]},
                {t: moveS, translate: [0, lowY, 0], rotate: [0, 0, 0]}
            ];
        }
        const tUp = moveS + waitS + moveS;

        return [
            {t: 0.0,           translate: [0, topY, 0], rotate: [0, 0, 0]},
            {t: moveS,         translate: [0, lowY, 0], rotate: [0, 0, 0]},
            {t: moveS + waitS, translate: [0, lowY, 0], rotate: [0, 0, 0]},
            {t: tUp,           translate: [0, topY, 0], rotate: [0, 0, 0]},
            {t: tUp + 1.0,     translate: [0, topY, 0], rotate: [0, 0, 0]}
        ];
    }

    // Named raise cycles of a hybrid lift (analysis.liftRaiseVariants), one
    // pair per raise special: the raise leg, then a ':then' cycle on the
    // raised span that the completed raise installs as the new default — the
    // plain lift presses that follow run between the raised top and the low
    // point, since vanilla plats compute their high from the LIVE floor.
    _buildRaiseVariants(si, origFh, minFh, anim, speed, waitS) {
        const raises = this._analysis.liftRaiseVariants[si];
        if (raises === undefined) {
            return null;
        }
        const variants = {};
        for (const [key, raise] of Object.entries(raises)) {
            const thenKey = (key + ':then');
            variants[key]     = this._buildRaiseCycle(raise, origFh, thenKey);
            variants[thenKey] = this._buildPostRaiseCycle(raise, origFh, minFh, anim, speed, waitS);
        }

        return variants;
    }

    // The raise leg starts at the pose the analyzer baked (the lift's actual
    // resting pose — the pose gate of start() arbitrates), with the
    // rising-floor boarding delay. onlyOnce: a same-variant restart would
    // snap the floor back to the start pose.
    _buildRaiseCycle(raise, origFh, thenKey) {
        const SCALE  = WadConstants.SCALE;
        const startY = (raise.startFh - origFh) * SCALE;
        const endY   = (raise.targetFh - origFh) * SCALE;
        const moveS  = WadConstants.moveDurationS(raise.targetFh - raise.startFh, raise.speed);

        return {
            keyframes:          WadConstants.raiseLegKeyframes(startY, endY, moveS),
            onlyOnce:           true,
            loop:               false,
            nextDefaultVariant: thenKey,
            ...WadConstants.pressCycleFields(WadConstants.floorUpPressProfile(raise.special))
        };
    }

    // The lift's own shape replayed on the raised span (targetFh ↔ minFh) at
    // the lift's own speed. A round-trip starts and ends on the raised top, so
    // its same-variant replay is safe (first pose = last pose); a one-way
    // lower is once — its raise special re-arms it by switching cycles.
    _buildPostRaiseCycle(raise, origFh, minFh, anim, speed, waitS) {
        const SCALE = WadConstants.SCALE;
        const topY  = (raise.targetFh - origFh) * SCALE;
        const lowY  = (minFh - origFh) * SCALE;
        const moveS = WadConstants.moveDurationS(raise.targetFh - minFh, speed);

        return {
            keyframes: WadLiftBuilder._liftKeyframes(anim, topY, lowY, moveS, waitS),
            onlyOnce:  (anim === 'one-way'),
            loop:      false,
            ...WadConstants.pressCycleFields(WadConstants.floorDownPressProfile(anim))
        };
    }
}
