/**
 * Draws the bodies from their views, the same on every device: which of the
 * eight rotation views shows from the viewed player, how bright the instance
 * is lit, where the glide puts it on screen and how a crouch squashes it. The
 * viewed player's own body is never drawn.
 */
class DoomBodyRenderer {
    /**
     * @param {Set<DoomBodyView>} views       - the level's bodies
     * @param {object}            levelData   - sector lights and their live effects
     * @param {int|null}          crushedView - the gib pool object, null when the game has none
     * @param {int|null}          emptyView   - the object of the viewed player's own body, null without player bodies
     */
    constructor(views, levelData, crushedView, emptyView) {
        this._views       = views;
        this._levelData   = levelData;
        this._crushedView = crushedView;
        this._emptyView   = emptyView;
        this._shown       = new WeakMap();   // view → what its instance was last given
    }

    /**
     * @param {User} viewer - the body the level is seen from
     */
    draw(viewer) {
        for (const view of this._views) {
            let shown = this._shown.get(view);
            if (shown === undefined) {
                shown = {objId: null, light: null, litSi: null, litBright: false, offset: false};
                this._shown.set(view, shown);
            }
            this._drawObject(view, shown, viewer);
            this._drawLight(view, shown);
            this._drawOffset(view, shown);
            view.getInstance().setRenderScale(view.getRenderScale());
        }
    }

    // A frame with no prebuilt view keeps the object already shown.
    _drawObject(view, shown, viewer) {
        const objId = this._objectOf(view, viewer);
        if ((objId === null) || (objId === shown.objId)) {
            return;
        }
        view.getInstance().setObject(objId);
        shown.objId = objId;
    }

    // A ground corpse keeps its gib pool whatever its state machine says (it
    // keeps running to its terminal frame for the nightmare respawn).
    _objectOf(view, viewer) {
        if ((view.getPlayerId() !== null) && (view.getPlayerId() === viewer.getPlayerId())) {
            return this._emptyView;
        }
        if (view.isCrushed()) {
            return this._crushedView;
        }
        if ((view.getFrames() === null) || (view.getFrameKey() === null)) {
            return null;
        }
        const views = view.getFrames()[view.getFrameKey()];
        if (views === undefined) {
            return null;
        }

        return ((views.length === 1) ? views[0] : views[this._rotationOctant(view, viewer)]);
    }

    // Octant of the view angle: world runs on worldX = doomX / worldZ = +doomY,
    // so atan2(dz, dx) IS the Doom angle. (angleToViewer − facing + 22.5°) / 45
    // is the thing→viewer form of the vanilla viewer→thing +202.5° formula.
    _rotationOctant(view, viewer) {
        const pos           = view.getInstance().getTransform().position;
        const angleToViewer = Math.atan2(viewer.z - pos[2], viewer.x - pos[0]) * 180 / Math.PI;

        return Math.floor(WadGeometry.normalizeAngle(angleToViewer - view.getFacing() + 22.5) / 45);
    }

    /**
     * Light of the sector the body CURRENTLY stands in, times that sector's
     * live effect: a monster leaving a dark room brightens, one entering a
     * strobing room pulses with it. A bright state (zscript Bright — the lost
     * soul burns in the dark) stays fullbright. The views are baked
     * fullbright, the instance carries the sector lighting.
     *
     * Only recomputed on an event that can change the answer: the body changed
     * sector, its state switched fullbright, or its sector runs a light effect.
     */
    _drawLight(view, shown) {
        const si     = view.getSector();
        const bright = view.isBright();
        if ((shown.light !== null) && (shown.litSi === si) && (shown.litBright === bright) && !this._hasLightEffect(si)) {
            return;
        }
        shown.litSi     = si;
        shown.litBright = bright;
        const wanted = ((bright) ? 1 : this._sectorLight(si));
        if (wanted !== shown.light) {
            shown.light = wanted;
            view.getInstance().setRenderLight(wanted);
        }
    }

    _drawOffset(view, shown) {
        const offset = view.getRenderOffset();
        if (offset !== null) {
            view.getInstance().setRenderOffset(offset[0], offset[1], offset[2]);
            shown.offset = true;
            return;
        }
        if (shown.offset) {
            view.getInstance().clearRenderOffset();
            shown.offset = false;
        }
    }

    // True when the sector runs one of the vanilla light thinkers, so its
    // brightness moves on its own and its bodies must follow every frame.
    _hasLightEffect(si) {
        return ((si !== null) && this._levelData.hasLightEffect(si));
    }

    // Sector brightness as a 0..1 factor; full light when the sector is unknown.
    _sectorLight(si) {
        if ((si === null) || (this._levelData.sectors[si] === undefined)) {
            return 1;
        }

        return (this._levelData.sectors[si].light / 255) * this._levelData.lightFactorOf(si);
    }
}
