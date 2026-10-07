/**
 * Per-level dynamic sector lights (transposition of the p_lights.c thinkers,
 * one step per tic at 35 tics/s): flicker (T_LightFlash), strobe
 * (T_StrobeFlash), glow (T_Glow) and fire flicker (T_FireFlicker). Each light
 * sector drives the brightness factor of every face tagged with its lightGroup
 * — static map, instance meshes (doors, lifts, switches…) and sprite
 * billboards. The thinker steps on the RAW lump bounds, like vanilla, and both
 * ends of the factor go through WadConstants.sectorLightLevel: the faces are
 * baked through that same curve, so the ratio moves the rendered level exactly
 * where the curve puts it — a dark phase lands ON the floor instead of black,
 * and a room whose rest level already sits there keeps a narrow but non-zero
 * swing. Only the random source deviates from vanilla (Math.random instead of
 * the P_Random table). A 'static' sector has no thinker: only a light line
 * action changes its level, or starts its strobe.
 */
class DoomSectorLightInteraction extends AbstractInteraction {
    /**
     * @param {object[]} lightSectors - analyzer descriptors
     *                                  {si, type, darkTics, sync, maxLight, minLight, neighbours}
     * @param {object[]} sectors      - the parsed sectors, whose raw level a
     *                                  neighbour without a state keeps
     */
    constructor(lightSectors, sectors) {
        super();
        this._states    = lightSectors.map((lightSector) => this._initState(lightSector));
        this._rawLevels = sectors.map((sector) => sector.lightRaw);
        this._clockS    = 0;
        this._targets   = null;
        // Lookup by sector index, so the weapon shading can read the same live
        // factor a sector pushes to its walls (DoomSectorLight.factorAt).
        this._bySi = {};
        for (const st of this._states) {
            this._bySi[st.si] = st;
        }
    }

    get code() {
        return 'sectorLights';
    }

    // Current brightness factor of a light sector (1 for a sector with no light
    // effect) — the value applied to its faces, which carry the rest level.
    getFactor(si) {
        const st = this._bySi[si];

        return ((st !== undefined) ? DoomSectorLightInteraction._factorOf(st) : 1);
    }

    // Both ends converted by the shared curve, so the factor times the baked
    // rest level lands on sectorLightLevel(current). The curve never returns
    // less than SECTOR_LIGHT_MIN, so the division is always safe.
    static _factorOf(st) {
        return (WadConstants.sectorLightLevel(st.light) / WadConstants.sectorLightLevel(st.base));
    }

    /**
     * A light line action on the sectors of its tag (EV_LightTurnOn,
     * EV_TurnTagLightsOff, EV_StartLightStrobing), neighbours read live.
     *
     * @param {object} action - WadMapAnalyzer.lineActionOf
     */
    applyLightAction(action) {
        for (const si of action.sectors) {
            const st = this._bySi[si];
            if (action.to === 'strobe') {
                this._startStrobe(st);
                continue;
            }
            st.light = this._levelFor(st, action.to);
        }
        this._pushFactors();
    }

    // Every thinker's mutable fields, in build order: a restored level keeps
    // the rooms a line switched off and the strobes it started.
    exportState() {
        return this._states.map((st) => ({
            type:     st.type,
            light:    st.light,
            maxLight: st.maxLight,
            minLight: st.minLight,
            darkTics: st.darkTics,
            count:    st.count,
            dir:      st.dir
        }));
    }

    importState(state) {
        state.forEach((saved, i) => {
            const st = this._states[i];
            if (st !== undefined) {
                Object.assign(st, saved);
            }
        });
        this._pushFactors();
    }

    // The live light level of every light sector, in build order.
    getLevels() {
        return this._states.map((st) => st.light);
    }

    triggered(instance) {
    }

    update(dt) {
        this._clockS += dt / 1000;
        const tics = Math.floor(this._clockS / WadConstants.SECONDS_PER_TIC);
        if (tics <= 0) {
            return;
        }
        this._clockS -= tics * WadConstants.SECONDS_PER_TIC;
        for (const st of this._states) {
            for (let t = 0; t < tics; t++) {
                this._stepTic(st);
            }
        }
        this._pushFactors();
    }

    // The levels a replica received, in build order (getLevels).
    setLevels(levels) {
        this._states.forEach((st, i) => {
            st.light = levels[i];
        });
        this._pushFactors();
    }

    // The factor registry lives per Object3d: push each group to every object
    // carrying light-grouped faces. The object set is stable for the whole
    // level (pickup removal despawns instances, never objects).
    _pushFactors() {
        if (this._targets === null) {
            this._targets = loader.objects().getAll()
                .filter((obj) => obj.faceList.some((fc) => fc.lightGroup !== null));
        }
        for (const st of this._states) {
            const factor = DoomSectorLightInteraction._factorOf(st);
            for (const obj of this._targets) {
                obj.setGroupLightFactor(st.si, factor);
            }
        }
    }

    // Initial state per effect: light starts at the sector's baked level;
    // async strobes start with a random 1-8 tic offset, sync ones at 1
    // (P_SpawnStrobeFlash), flicker with (P_Random()&64)+1 (P_SpawnLightFlash),
    // fire flicker with its 4-tic period (P_SpawnFireFlicker).
    _initState(lightSector) {
        const st = {
            si:         lightSector.si,
            type:       lightSector.type,
            darkTics:   lightSector.darkTics,
            maxLight:   lightSector.maxLight,
            minLight:   lightSector.minLight,
            neighbours: lightSector.neighbours,
            base:       lightSector.maxLight,
            light:      lightSector.maxLight,
            dir:        -1,
            count:      1
        };
        if (lightSector.type === 'flicker') {
            st.count = (this._rand() & WadConstants.LIGHT_FLASH_MAX_MASK) + 1;
        }
        if (lightSector.type === 'strobe') {
            st.count = ((lightSector.sync) ? 1 : this._asyncStrobeCount());
        }
        if (lightSector.type === 'fire') {
            st.count = WadConstants.LIGHT_FIRE_PERIOD_TICS;
        }

        return st;
    }

    _stepTic(st) {
        if (st.type === 'static') {
            return;
        }
        if (st.type === 'glow') {
            this._stepGlow(st);
            return;
        }
        if (--st.count > 0) {
            return;
        }
        if (st.type === 'flicker') {
            this._stepFlicker(st);
        }
        if (st.type === 'strobe') {
            this._stepStrobe(st);
        }
        if (st.type === 'fire') {
            this._stepFire(st);
        }
    }

    // T_LightFlash: long random stretches at max, short random dips at min
    _stepFlicker(st) {
        if (st.light === st.maxLight) {
            st.light = st.minLight;
            st.count = (this._rand() & WadConstants.LIGHT_FLASH_MIN_MASK) + 1;
            return;
        }
        st.light = st.maxLight;
        st.count = (this._rand() & WadConstants.LIGHT_FLASH_MAX_MASK) + 1;
    }

    // T_StrobeFlash: STROBEBRIGHT tics at max, darkTics at min
    _stepStrobe(st) {
        if (st.light === st.minLight) {
            st.light = st.maxLight;
            st.count = WadConstants.LIGHT_STROBE_BRIGHT_TICS;
            return;
        }
        st.light = st.minLight;
        st.count = st.darkTics;
    }

    // T_FireFlicker: every 4 tics, a random dip of 0-48 floored at minLight
    _stepFire(st) {
        const amount = (this._rand() & 3) * WadConstants.LIGHT_FIRE_STEP;
        st.light = ((st.maxLight - amount < st.minLight) ? st.minLight : st.maxLight - amount);
        st.count = WadConstants.LIGHT_FIRE_PERIOD_TICS;
    }

    // T_Glow: GLOWSPEED per tic, bouncing between minLight and maxLight
    _stepGlow(st) {
        if (st.dir === -1) {
            st.light -= WadConstants.LIGHT_GLOW_SPEED;
            if (st.light <= st.minLight) {
                st.light += WadConstants.LIGHT_GLOW_SPEED;
                st.dir = 1;
            }
            return;
        }
        st.light += WadConstants.LIGHT_GLOW_SPEED;
        if (st.light >= st.maxLight) {
            st.light -= WadConstants.LIGHT_GLOW_SPEED;
            st.dir = -1;
        }
    }

    // EV_LightTurnOn with 0 takes the brightest neighbour, from 0;
    // EV_TurnTagLightsOff the darkest, capped at the sector's own level.
    _levelFor(st, to) {
        const levels = st.neighbours.map((si) => this._liveLevel(si));
        if (to === 'brightestNeighbour') {
            return Math.max(0, ...levels);
        }
        if (to === 'darkestNeighbour') {
            return Math.min(st.light, ...levels);
        }

        return to;
    }

    _liveLevel(si) {
        const st = this._bySi[si];

        return ((st !== undefined) ? st.light : this._rawLevels[si]);
    }

    // P_SpawnStrobeFlash(sector, SLOWDARK, 0). Vanilla skips a sector whose
    // mover holds specialdata and may stack a second light thinker; one light
    // state per sector here, so a sector with an effect keeps its own.
    _startStrobe(st) {
        if (st.type !== 'static') {
            return;
        }
        st.type     = 'strobe';
        st.darkTics = WadConstants.LIGHT_STROBE_SLOW_DARK_TICS;
        st.maxLight = st.light;
        st.minLight = this._levelFor(st, 'darkestNeighbour');
        if (st.minLight === st.maxLight) {
            st.minLight = 0;
        }
        st.count = this._asyncStrobeCount();
    }

    // P_SpawnStrobeFlash: an async strobe starts 1 to 8 tics in.
    _asyncStrobeCount() {
        return (this._rand() & 7) + 1;
    }

    _rand() {
        return Math.trunc(Math.random() * 256);
    }
}
