/**
 * Automap view: a plan of the level drawn over the running game, which never
 * stops for it — the player can keep walking with the map open, and the virtual
 * pad stays on top of it.
 *
 * Fixed framing: the whole level is fitted once per level, never centred on the
 * player, so the map reads like a paper plan rather than a radar — north up,
 * or north to the right when turning the plan a quarter fills the panel better
 * (see _layout). Only the walls and the player are drawn (vanilla shows the
 * things under the IDDT cheat alone).
 *
 * The lines are stroked one path per colour: a path per line would mean
 * thousands of canvas state changes per frame, where the level's few colour
 * roles need a handful.
 */
class HudAutomap extends AbstractHud {
    constructor(engine) {
        super(engine);
        this._game    = null;
        this._automap = null;
        this._colors  = null;
        this._keys    = {};
        this._buckets = {};
        this._locked  = [];
        for (const role of HudAutomap.STROKE_ROLES) {
            this._buckets[role] = [];
        }
        this._root      = null;
        this._canvas    = null;
        this._ctx       = null;
        this._visible   = false;
        this._width     = 0;
        this._height    = 0;
        this._scale     = 1;
        this._lineWidth = 1;
        this._mapX      = [1, 0, 0];
        this._mapY      = [0, -1, 0];
    }

    bindGame(game) {
        this._game = game;
        return this;
    }

    /**
     * Level automap. Its palette is per-game profile data, resolved once here:
     * the profile hands back a fresh table on every call.
     *
     * @param {DoomAutomap} automap
     */
    bindAutomap(automap) {
        const profile = this._game.getGameProfile();
        this._automap = automap;
        this._colors  = profile.automapColors();
        this._keys    = profile.hudKeyColors();
        this._applyBackground();
        this._width = 0;   // force the layout on the next frame

        return this;
    }

    // Bind and init arrive in either order: the wash is applied by whichever
    // lands last.
    _applyBackground() {
        if ((this._root === null) || (this._colors === null)) {
            return;
        }
        this._root.style.backgroundColor = AbstractHud.rgba(this._colors.background, HudAutomap.BACKGROUND_ALPHA);
    }

    isVisible() {
        return this._visible;
    }

    setVisible(visible) {
        this._visible = (visible === true);
        if (this._root !== null) {
            this._root.style.display = ((this._visible) ? 'block' : 'none');
        }
    }

    // Nothing to show: the key stays inert rather than raising an empty panel.
    toggle() {
        if (this._automap === null) {
            return;
        }
        this.setVisible(!this._visible);
    }

    init(container) {
        super.init(container);

        this._root = document.createElement('div');
        Object.assign(this._root.style, {
            position: 'absolute',
            left:   (HudAutomap.INSET_PERCENT + '%'),
            top:    (HudAutomap.INSET_PERCENT + '%'),
            width:  ((100 - 2 * HudAutomap.INSET_PERCENT) + '%'),
            height: ((100 - 2 * HudAutomap.INSET_PERCENT) + '%'),
            display: 'none',
            borderRadius: '0.5em',
            fontSize: '3cqh',
            containerType: 'size',
            pointerEvents: 'none'
        });
        container.appendChild(this._root);

        const title = document.createElement('div');
        Object.assign(title.style, {
            position: 'absolute', top: '1cqh', left: '0', width: '100%',
            textAlign: 'center', color: '#fff', fontFamily: 'system-ui, sans-serif',
            fontSize: '3.4cqh', fontWeight: '700', textShadow: '0 0 0.3cqh #000'
        });
        title.innerText = appTranslator.get('hud.automap');
        this._root.appendChild(title);

        this._canvas = document.createElement('canvas');
        Object.assign(this._canvas.style, {
            position: 'absolute', top: '0', left: '0', width: '100%', height: '100%'
        });
        this._root.appendChild(this._canvas);
        this._ctx = this._canvas.getContext('2d');
        this._applyBackground();
    }

    update() {
        if (!this._visible || (this._automap === null) || (this._user === null)) {
            return;
        }
        if (!this._syncSize()) {
            return;
        }
        this._ctx.clearRect(0, 0, this._width, this._height);
        this._collect();
        this._strokeBuckets();
        this._strokeLocked();
        this._drawPlayer();
    }

    // --- Internal ---

    // The framing is recomputed only when the box changes.
    _syncSize() {
        const width  = this._root.clientWidth;
        const height = this._root.clientHeight;
        if ((width === 0) || (height === 0)) {
            return false;
        }
        if ((width === this._width) && (height === this._height)) {
            return true;
        }
        this._width         = width;
        this._height        = height;
        this._canvas.width  = width;
        this._canvas.height = height;
        this._layout();

        return true;
    }

    // Ratio preserved: a stretched plan reads false. The plan is turned a
    // quarter when that fits BIGGER, which in a landscape panel means a level
    // taller than wide — it would otherwise waste both side margins. The
    // criterion is the fitted scale itself rather than the level's shape: it is
    // what we actually want, and it holds whatever the panel's proportions.
    //
    // The mapping is kept as the coefficients of Doom → panel, so the quarter
    // turn costs no test per drawn point: [xFactor, yFactor, offset] per screen
    // axis, north to the RIGHT once turned.
    _layout() {
        const bounds = this._automap.getBounds();
        const spanX  = Math.max(bounds[2] - bounds[0], 1);
        const spanY  = Math.max(bounds[3] - bounds[1], 1);
        const padX   = this._width * HudAutomap.PADDING_RATIO;
        const padTop = this._height * HudAutomap.PADDING_TOP_RATIO;
        const boxW   = this._width - 2 * padX;
        const boxH   = this._height - padTop - this._height * HudAutomap.PADDING_RATIO;

        this._lineWidth = Math.max(1, this._height * HudAutomap.LINE_WIDTH_RATIO);

        const upright = Math.min(boxW / spanX, boxH / spanY);
        const turned  = Math.min(boxW / spanY, boxH / spanX);
        const quarter = (turned > upright);
        this._scale   = ((quarter) ? turned : upright);

        const usedW = ((quarter) ? spanY : spanX) * this._scale;
        const usedH = ((quarter) ? spanX : spanY) * this._scale;
        const left  = padX + (boxW - usedW) / 2;
        const top   = padTop + (boxH - usedH) / 2;
        if (quarter) {
            this._mapX = [0, this._scale, left - bounds[1] * this._scale];
            this._mapY = [this._scale, 0, top - bounds[0] * this._scale];
            return;
        }
        // Doom's +y is north, the canvas' +y goes down.
        this._mapX = [this._scale, 0, left - bounds[0] * this._scale];
        this._mapY = [0, -this._scale, top + bounds[3] * this._scale];
    }

    _screenX(doomX, doomY) {
        return ((this._mapX[0] * doomX) + (this._mapX[1] * doomY) + this._mapX[2]);
    }

    _screenY(doomX, doomY) {
        return ((this._mapY[0] * doomX) + (this._mapY[1] * doomY) + this._mapY[2]);
    }

    // Screen direction of a Doom heading, unit length: the mapping's linear
    // part without its scale, so a marker drawn in pixels turns with the plan.
    _screenDir(angle) {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        return [(((this._mapX[0] * cos) + (this._mapX[1] * sin)) / this._scale),
            (((this._mapY[0] * cos) + (this._mapY[1] * sin)) / this._scale)];
    }

    _collect() {
        const allMap = ((this._game !== null) && this._game.hasMapPowerup(this._user));
        for (const role of HudAutomap.STROKE_ROLES) {
            this._buckets[role].length = 0;
        }
        this._locked.length = 0;
        for (const line of this._automap.getLines()) {
            const role = this._automap.roleOf(line, allMap);
            if (role === null) {
                continue;
            }
            if (role === 'locked') {
                this._locked.push(line);
                continue;
            }
            this._buckets[role].push(line);
        }
    }

    _strokeBuckets() {
        this._ctx.lineWidth = this._lineWidth;
        for (const role of HudAutomap.STROKE_ROLES) {
            const lines = this._buckets[role];
            if (lines.length === 0) {
                continue;
            }
            this._ctx.strokeStyle = AbstractHud.rgba(this._colors[role], 1);
            this._ctx.beginPath();
            for (const line of lines) {
                this._ctx.moveTo(this._screenX(line.x1, line.y1), this._screenY(line.x1, line.y1));
                this._ctx.lineTo(this._screenX(line.x2, line.y2), this._screenY(line.x2, line.y2));
            }
            this._ctx.stroke();
        }
    }

    // One stroke each: a handful of locked lines per level, each in the colour
    // of the key it demands, or the profile's flat one for a key without. Drawn
    // thicker so the door one is looking for stands out of the plan.
    _strokeLocked() {
        this._ctx.lineWidth = (this._lineWidth * HudAutomap.LOCKED_WIDTH_FACTOR);
        for (const line of this._locked) {
            this._ctx.strokeStyle = (this._keys[line.keyCode] ?? AbstractHud.rgba(this._colors.locked, 1));
            this._ctx.beginPath();
            this._ctx.moveTo(this._screenX(line.x1, line.y1), this._screenY(line.x1, line.y1));
            this._ctx.lineTo(this._screenX(line.x2, line.y2), this._screenY(line.x2, line.y2));
            this._ctx.stroke();
        }
    }

    // The marker size does NOT follow the fitting factor: on a wide level that
    // would shrink it to nothing. Its heading goes through _screenDir, so it
    // turns with the plan.
    _drawPlayer() {
        const doomX = this._user.getCameraX() / WadConstants.SCALE;
        const doomY = this._user.getCameraZ() / WadConstants.SCALE;
        const x     = this._screenX(doomX, doomY);
        const y     = this._screenY(doomX, doomY);
        const angle = WadGeometry.doomAngleYaw(this._user.yaw) * DEG_TO_RAD;
        const size  = Math.max(HudAutomap.PLAYER_MIN_PX, this._height * HudAutomap.PLAYER_SIZE_RATIO);

        this._ctx.fillStyle = AbstractHud.rgba(HudAutomap.PLAYER_RGB, 1);
        this._ctx.beginPath();
        for (const [distance, offset] of HudAutomap.PLAYER_SHAPE) {
            const [dirX, dirY] = this._screenDir(angle + offset);
            this._ctx.lineTo(x + dirX * size * distance, y + dirY * size * distance);
        }
        this._ctx.closePath();
        this._ctx.fill();
    }
}

// Panel: quasi fullscreen, and the framing margins inside it (the top one also
// clears the title).
HudAutomap.INSET_PERCENT       = 2;
HudAutomap.PADDING_RATIO       = 0.03;
HudAutomap.PADDING_TOP_RATIO   = 0.08;
HudAutomap.BACKGROUND_ALPHA    = 0.75;
// Stroke width and player marker, as fractions of the panel height; a locked
// door is stroked thicker than the rest.
HudAutomap.LINE_WIDTH_RATIO    = 0.0018;
HudAutomap.LOCKED_WIDTH_FACTOR = 2;
HudAutomap.PLAYER_SIZE_RATIO   = 0.016;
HudAutomap.PLAYER_MIN_PX       = 6;
// Deliberate deviation: vanilla draws the player in `yourcolor` (white) and
// keeps this green for the things, which we never show.
HudAutomap.PLAYER_RGB        = [0x74, 0xfc, 0x6c];
// Arrow corners as [distance from the centre, angle offset from the heading].
HudAutomap.PLAYER_SHAPE = [
    [1, 0],
    [0.8, (140 * Math.PI / 180)],
    [0.8, (-140 * Math.PI / 180)]
];
// Uniform roles, drawn in this order so the walls win where lines overlap; the
// locked ones are stroked apart (their colour varies per key).
HudAutomap.STROKE_ROLES = ['notSeen', 'floorStep', 'ceilStep', 'wall'];
