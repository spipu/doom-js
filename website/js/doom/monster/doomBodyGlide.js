/**
 * How a body's teleport-stepped motion is smoothed on screen, written into
 * its view. Stays with the simulation: only the AI tells a walk step from a
 * momentum slide or a teleport.
 */
class DoomBodyGlide {
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
            m.view.clearRenderOffset();
            return;
        }
        const p = m.inst.getTransform().position;
        if ((Math.abs(p[0] - fromX) < DoomBodyGlide.MOVE_EPSILON)
            && (Math.abs(p[1] - fromY) < DoomBodyGlide.MOVE_EPSILON)
            && (Math.abs(p[2] - fromZ) < DoomBodyGlide.MOVE_EPSILON)) {
            return;
        }
        // Only a REAL walk step glides over the state duration; a momentum
        // slide (knockback, drift) smooths over its own single tic — a shove
        // mid-chase must not rubber-band across the whole See state.
        const durTics = ((m.walkStepped) ? Math.max(1, m.ticsLeft) : 1);
        m.blend = {fx: fromX, fy: fromY, fz: fromZ, t0: clockMs, dur: durTics * WadConstants.MS_PER_TIC};
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
        const progress = (clockMs - m.blend.t0) / m.blend.dur;
        if (progress >= 1) {
            m.view.clearRenderOffset();
            m.blend = null;
            return;
        }
        const p = m.inst.getTransform().position;
        m.view.setRenderOffset(
            (m.blend.fx - p[0]) * (1 - progress),
            (m.blend.fy - p[1]) * (1 - progress),
            (m.blend.fz - p[2]) * (1 - progress)
        );
    }
}

// Displacement under which a tic is considered to have moved nothing, so no
// glide is armed (world units).
DoomBodyGlide.MOVE_EPSILON = 1e-9;
