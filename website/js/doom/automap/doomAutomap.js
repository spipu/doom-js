/**
 * The level's automap: its geometry, what the player has already seen, and the
 * role each line plays when drawn.
 *
 * This is game state, not display: the reveal runs whether the map is on screen
 * or not (vanilla marks the lines from the renderer, so a room crossed with the
 * map closed is already drawn when it opens), and the seen lines go into the
 * saved game.
 */
class DoomAutomap {
    /**
     * @param {object}            model   - output of WadAutomapBuilder.build()
     * @param {DoomSectorHeights} heights - live sector heights
     */
    constructor(model, heights) {
        this._model     = model;
        this._heights   = heights;
        this._reveal    = new DoomAutomapReveal(model.bsp, model.byLdIdx, heights);
        this._lastX     = null;
        this._lastY     = null;
        this._lastAngle = 0;
    }

    getLines() {
        return this._model.lines;
    }

    getBounds() {
        return this._model.bounds;
    }

    /**
     * Reveal from the player's current spot, skipped while he has neither
     * moved nor turned: the marking only ever adds.
     *
     * @param {User}   user
     * @param {number} halfWindowDeg half of the game's current field of view
     */
    reveal(user, halfWindowDeg) {
        const x     = user.getCameraX() / WadConstants.SCALE;
        const y     = user.getCameraZ() / WadConstants.SCALE;
        const angle = WadGeometry.doomAngleYaw(user.yaw);
        const turn  = Math.abs(angle - this._lastAngle);
        if ((this._lastX !== null)
            && (Math.abs(x - this._lastX) < DoomAutomap.MOVE_EPSILON)
            && (Math.abs(y - this._lastY) < DoomAutomap.MOVE_EPSILON)
            && (Math.min(turn, 360 - turn) < DoomAutomap.TURN_EPSILON)) {
            return;
        }
        this._lastX     = x;
        this._lastY     = y;
        this._lastAngle = angle;
        this._reveal.revealFrom(x, y, angle, halfWindowDeg);
    }

    /**
     * Colour role of a line, transcription of AM_drawWalls (am_map.cpp). The
     * order matters: a secret door reads as a plain wall, and a two-sided line
     * with neither a floor nor a ceiling step is drawn by NOTHING — which is
     * what keeps the original's map readable.
     *
     * Deviation: a locked line takes its own key's colour whatever the game,
     * where vanilla only does it for Raven (its `displayLocks` colorset flag).
     *
     * @param {object}  line
     * @param {boolean} allMap true while the player holds a map power-up
     * @returns {string|null} role, or null to draw nothing
     */
    roleOf(line, allMap) {
        if (line.dontDraw) {
            return null;
        }
        if (!line.seen) {
            return ((allMap) ? 'notSeen' : null);
        }
        if (line.secret) {
            return 'wall';
        }
        if (line.keyCode !== null) {
            return 'locked';
        }
        if (line.siBack === null) {
            return 'wall';
        }
        if (this._heights.floorOf(line.siFront) !== this._heights.floorOf(line.siBack)) {
            return 'floorStep';
        }
        if (this._heights.ceilingOf(line.siFront) !== this._heights.ceilingOf(line.siBack)) {
            return 'ceilStep';
        }

        return null;
    }

    /**
     * Revealed lines, by LINEDEF index — never by position in our own list (the
     * idiom of DoomSecretInteraction): that index belongs to the WAD's LINEDEFS
     * lump, so it survives any reshuffle of the build.
     */
    exportState() {
        const seen = [];
        for (const line of this._model.lines) {
            if (line.seen) {
                seen.push(line.ldIdx);
            }
        }

        return {lineCount: this._model.lineCount, seen: seen};
    }

    /**
     * A different line count means the WAD file changed under the same id (the
     * id is only its name): the map restarts blank rather than painting
     * nonsense. Unknown indexes are ignored for the same reason.
     */
    importState(state) {
        if (((state ?? null) === null) || (state.lineCount !== this._model.lineCount)) {
            return;
        }
        for (const line of this._model.lines) {
            line.seen = false;
        }
        for (const ldIdx of state.seen) {
            const line = this._model.byLdIdx[ldIdx];
            if (line !== undefined) {
                line.seen = true;
            }
        }
    }
}

// Displacement (map units) and turn (degrees) below which a new pass would
// reveal nothing new.
DoomAutomap.MOVE_EPSILON = 1;
DoomAutomap.TURN_EPSILON = 0.5;
