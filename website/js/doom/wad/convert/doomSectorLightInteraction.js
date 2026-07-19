/**
 * Per-level dynamic sector lights (transposition of the p_lights.c thinkers,
 * one step per tic at 35 tics/s): flicker (T_LightFlash), strobe
 * (T_StrobeFlash), glow (T_Glow) and fire flicker (T_FireFlicker). Each light
 * sector drives the brightness factor (current level / baked level) of every
 * face tagged with its lightGroup — static map, instance meshes (doors, lifts,
 * switches…) and sprite billboards. Only the random source deviates from
 * vanilla (Math.random instead of the P_Random table).
 */
class DoomSectorLightInteraction extends AbstractInteraction {
    /**
     * @param {object[]} lightSectors - analyzer descriptors
     *                                  {si, type, darkTics, sync, maxLight, minLight}
     */
    constructor(lightSectors) {
        super();
        this._states  = lightSectors.map((s) => this._initState(s));
        this._clockS  = 0;
        this._targets = null;
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
    // effect), i.e. current level / baked level — the value applied to its faces.
    getFactor(si) {
        const st = this._bySi[si];
        if (st === undefined) {
            return 1;
        }
        return ((st.maxLight > 0) ? (st.light / st.maxLight) : 1);
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

        // The factor registry lives per Object3d: push each group to every
        // object carrying light-grouped faces. The object set is stable for the
        // whole level (pickup removal despawns instances, never objects).
        if (this._targets === null) {
            this._targets = loader.objects().getAll()
                .filter((obj) => obj.faceList.some((fc) => fc.lightGroup !== null));
        }

        for (const st of this._states) {
            for (let t = 0; t < tics; t++) {
                this._stepTic(st);
            }
            const factor = ((st.maxLight > 0) ? (st.light / st.maxLight) : 1);
            for (const obj of this._targets) {
                obj.setGroupLightFactor(st.si, factor);
            }
        }
    }

    // Initial state per effect: light starts at the sector's baked level;
    // async strobes start with a random 1-8 tic offset, sync ones at 1
    // (P_SpawnStrobeFlash), flicker with (P_Random()&64)+1 (P_SpawnLightFlash),
    // fire flicker with its 4-tic period (P_SpawnFireFlicker).
    _initState(s) {
        const st = {
            si:       s.si,
            type:     s.type,
            darkTics: s.darkTics,
            maxLight: s.maxLight,
            minLight: s.minLight,
            light:    s.maxLight,
            dir:      -1,
            count:    1
        };
        if (s.type === 'flicker') {
            st.count = (this._rand() & WadConstants.LIGHT_FLASH_MAX_MASK) + 1;
        }
        if (s.type === 'strobe') {
            st.count = ((s.sync) ? 1 : (this._rand() & 7) + 1);
        }
        if (s.type === 'fire') {
            st.count = WadConstants.LIGHT_FIRE_PERIOD_TICS;
        }

        return st;
    }

    _stepTic(st) {
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

    _rand() {
        return Math.trunc(Math.random() * 256);
    }
}
