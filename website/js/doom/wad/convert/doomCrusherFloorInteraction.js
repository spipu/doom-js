/**
 * Turns a descending crusher back up on the live floor plus its close margin,
 * for the sectors where a floor mover can rise under it (Boom clamp of
 * sector_t::MoveCeiling, UZDoom dsectoreffect.cpp).
 */
class DoomCrusherFloorInteraction extends AbstractInteraction {
    /**
     * @param {object[]}          crushers - [{si, code, cycle, closeMargin, topCeiling}], heights in map units
     * @param {DoomSectorHeights} heights  - live sector heights
     */
    constructor(crushers, heights) {
        super();
        this._crushers = crushers.map((crusher) => ({...crusher, instance: null, lastCeiling: null, returning: false}));
        this._heights  = heights;
    }

    get code() {
        return 'crusherFloor';
    }

    update(dt) {
        for (const crusher of this._crushers) {
            this._watch(crusher);
        }
    }

    exportState() {
        const returning = this._crushers.filter((crusher) => crusher.returning).map((crusher) => crusher.code);

        return ((returning.length > 0) ? returning : null);
    }

    importState(state) {
        for (const crusher of this._crushers) {
            crusher.returning   = state.includes(crusher.code);
            crusher.lastCeiling = null;
        }
    }

    // --- Internal ---

    _watch(crusher) {
        crusher.instance ??= loader.instances().getByCode(crusher.code);
        const ceiling = this._heights.ceilingOf(crusher.si);
        const last    = crusher.lastCeiling;
        const bottom  = (this._heights.floorOf(crusher.si) + crusher.closeMargin);
        crusher.lastCeiling = ceiling;
        if (crusher.returning) {
            this._resumeAtTop(crusher, ceiling, bottom);
            return;
        }
        const descending = ((last !== null) && (ceiling < last));
        if (descending && (ceiling < (bottom - DoomCrusherFloorInteraction.HEIGHT_EPSILON))) {
            crusher.instance.reverseBlocked();
            crusher.returning = true;
        }
    }

    // The reversed descent ends parked on the cycle's first keyframe; it stays
    // there while the floor leaves no room to come down (E2M4 raises it to the ceiling).
    _resumeAtTop(crusher, ceiling, bottom) {
        const top = (crusher.topCeiling - DoomCrusherFloorInteraction.HEIGHT_EPSILON);
        if ((ceiling < top) || (bottom >= top)) {
            return;
        }
        crusher.returning = !crusher.instance.start(crusher.cycle);
    }
}

// Map units: the bottom of an unraised floor is reached exactly, never crossed.
DoomCrusherFloorInteraction.HEIGHT_EPSILON = 0.01;
