/**
 * How a body is DRAWN: which of its eight rotation views shows, how bright the
 * instance is lit, and how its teleport-stepped motion is smoothed on screen.
 *
 * Nothing here touches the simulation — a body walks, fights and dies exactly
 * the same with this module doing nothing. It is the seam between the 35 Hz
 * logic and the frame rate.
 */
class DoomMonsterView {
    constructor() {
        this._levelData = null;
        this._user      = null;
    }

    setLevelData(levelData) {
        this._levelData = levelData;
        return this;
    }

    setUser(user) {
        this._user = user;
        return this;
    }

    /**
     * Sprite view of a body's current state, picked by the octant it is seen
     * from. A ground corpse keeps its gib pool whatever its state machine says
     * (it keeps running to its terminal frame for the nightmare respawn).
     *
     * @param {object} m monster record
     */
    refresh(m) {
        if (m.crushedFlat) {
            return;
        }
        const state = m.def.getState(m.stateKey);
        const views = m.frames[DoomMonsterDef.viewKey(state.getSprite(), state.getFrame())];
        if (views === undefined) {
            return;
        }
        const objId = ((views.length === 1) ? views[0] : views[this._rotationOctant(m)]);
        if (objId !== m.shownObj) {
            m.inst.setObject(objId);
            m.shownObj = objId;
        }
    }

    /**
     * Light of the sector the body CURRENTLY stands in, times that sector's
     * live effect: a monster leaving a dark room brightens, one entering a
     * strobing room pulses with it. A bright state (zscript Bright — the lost
     * soul burns in the dark) stays fullbright.
     *
     * @param {object} m monster record
     */
    applyLight(m) {
        this.pushLight(m, m.def.getState(m.stateKey).isBright());
    }

    /**
     * Shared by monster and drop records ({inst, si, renderLight, litSi,
     * litBright}) — both views are baked fullbright, the instance carries the
     * sector lighting.
     *
     * Only recomputed on an event that can change the answer: the body changed
     * sector, its state switched fullbright, or its sector runs a light effect.
     * A body standing still in a steadily-lit room is lit once and never again.
     *
     * @param {object}  rec    monster or drop record
     * @param {boolean} bright fullbright state
     */
    pushLight(rec, bright) {
        if ((rec.renderLight !== null) && (rec.litSi === rec.si) && (rec.litBright === bright)
            && !this._hasLightEffect(rec.si)) {
            return;
        }
        rec.litSi     = rec.si;
        rec.litBright = bright;
        const wanted = ((bright) ? 1 : this._sectorLight(rec.si));
        if (wanted !== rec.renderLight) {
            rec.renderLight = wanted;
            rec.inst.setRenderLight(wanted);
        }
    }

    /**
     * Arm the render glide after a tic that moved the body: from its previous
     * spot, over the current state's duration for a walking step (the next
     * A_Chase step lands right when the glide ends — continuous motion) or a
     * single tic for momentum slides. A teleport snaps instead.
     *
     * @param {number} clockMs the system's running clock
     */
    armBlend(m, fromX, fromY, fromZ, clockMs) {
        if (m.snapRender) {
            m.snapRender = false;
            m.blend      = null;
            m.inst.clearRenderOffset();
            return;
        }
        const p = m.inst.getTransform().position;
        if ((Math.abs(p[0] - fromX) < DoomMonsterView.MOVE_EPSILON)
            && (Math.abs(p[1] - fromY) < DoomMonsterView.MOVE_EPSILON)
            && (Math.abs(p[2] - fromZ) < DoomMonsterView.MOVE_EPSILON)) {
            return;
        }
        // Only a REAL walk step glides over the state duration; a momentum
        // slide (knockback, drift) smooths over its own single tic — a shove
        // mid-chase must not rubber-band across the whole See state.
        const durTics = ((m.walkStepped) ? Math.max(1, m.ticsLeft) : 1);
        m.blend = {fx: fromX, fy: fromY, fz: fromZ, t0: clockMs, dur: durTics * DoomMonsterSystem.MS_PER_TIC};
    }

    /**
     * Render smoothing (user decision, GZDoom-like): the logical body moves by
     * teleport-steps at 35 Hz, the DISPLAYED body glides from the previous spot
     * to the current one — vertically too, so stair steps flow like the
     * player's camera smoothing. Only the render offset moves, never the
     * physics.
     *
     * @param {number} clockMs the system's running clock
     */
    applyBlend(m, clockMs) {
        if (m.blend === null) {
            return;
        }
        const k = (clockMs - m.blend.t0) / m.blend.dur;
        if (k >= 1) {
            m.inst.clearRenderOffset();
            m.blend = null;
            return;
        }
        const p = m.inst.getTransform().position;
        m.inst.setRenderOffset(
            (m.blend.fx - p[0]) * (1 - k),
            (m.blend.fy - p[1]) * (1 - k),
            (m.blend.fz - p[2]) * (1 - k)
        );
    }

    // --- Internal ---

    // Octant of the view angle: world runs on worldX = doomX / worldZ = +doomY,
    // so atan2(dz, dx) IS the Doom angle. (angleToViewer − facing + 22.5°) / 45
    // is the thing→viewer form of the vanilla viewer→thing +202.5° formula.
    _rotationOctant(m) {
        const pos = m.inst.getTransform().position;
        const angleToViewer = Math.atan2(this._user.z - pos[2], this._user.x - pos[0]) * 180 / Math.PI;

        return Math.floor(WadGeometry.normalizeAngle(angleToViewer - m.facing + 22.5) / 45);
    }

    // True when the sector runs one of the vanilla light thinkers, so its
    // brightness moves on its own and its bodies must follow every frame.
    _hasLightEffect(si) {
        return ((si !== null) && (this._levelData !== null) && this._levelData.hasLightEffect(si));
    }

    // Sector brightness as a 0..1 factor; full light when the sector is unknown.
    _sectorLight(si) {
        if ((si === null) || (this._levelData === null) || (this._levelData.sectors[si] === undefined)) {
            return 1;
        }

        return (this._levelData.sectors[si].light / 255) * this._levelData.lightFactorOf(si);
    }
}

// Displacement under which a tic is considered to have moved nothing, so no
// glide is armed (world units).
DoomMonsterView.MOVE_EPSILON = 1e-9;
