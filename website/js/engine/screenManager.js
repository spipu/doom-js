class ScreenManager {
    constructor(screenId, options) {
        options = options ?? {};

        this._screen            = document.getElementById(screenId);
        this._engine            = null;
        this._hud               = null;
        this._fullscreen        = (options.fullscreen === true);
        this._screenWidth       = options.width ?? null;
        this._screenHeight      = options.height ?? null;
        this._viewPortWidth     = options.viewPortWidth ?? 64;
        this._virtualWidth      = options.virtualWidth ?? null;
        this._virtualHeight     = options.virtualHeight ?? null;
        this._hasVirtualDisplay = (this._virtualWidth !== null && this._virtualHeight !== null);
        this._ratio             = 1;
        this._canvasId          = screenId + '_canvas';

        this._initContainer();
        this._initDisplay();
        this._initCanvas();
        this._initHudOverlay();

        if (this._fullscreen) {
            this._resizeObserver = new ResizeObserver(() => {
                this._triggerResize();
            });
            this._resizeObserver.observe(this._container);
        }
    }

    _initContainer() {
        this._container = document.createElement('div');
        this._container.style.position = ((this._fullscreen) ? 'fixed' : 'relative');
        this._container.style.display  = ((this._fullscreen) ? 'block'  : 'inline-block');

        if (this._fullscreen) {
            this._container.style.top    = '0';
            this._container.style.left   = '0';
            this._container.style.width  = '100vw';
            this._container.style.height = '100vh';
        }

        this._screen.appendChild(this._container);
    }

    _initDisplay() {
        this._display = this._container;

        if (this._hasVirtualDisplay) {
            this._display = document.createElement('div');
            this._display.style.position = 'absolute';
            this._container.appendChild(this._display);
        }
    }

    _initCanvas() {
        this._canvas = document.createElement('canvas');
        this._canvas.id = this._canvasId;

        if (this._fullscreen || this._hasVirtualDisplay) {
            this._canvas.style.display = 'block';
            this._canvas.style.width   = '100%';
            this._canvas.style.height  = '100%';
        }

        this._display.appendChild(this._canvas);
    }

    _initHudOverlay() {
        this._hudEl = document.createElement('div');
        this._hudEl.style.position      = 'absolute';
        this._hudEl.style.top           = '0';
        this._hudEl.style.left          = '0';
        this._hudEl.style.width         = '100%';
        this._hudEl.style.height        = '100%';
        this._hudEl.style.pointerEvents = 'none';
        this._display.appendChild(this._hudEl);
    }

    bindEngine(engine) {
        this._engine = engine;

        if (this._fullscreen) {
            this._triggerResize();
            return this;
        }

        this._resize();
        return this;
    }

    bindHud(hud) {
        this._hud = hud;
        this._hud.init(this._hudEl);
        this._hud.setRatio(this._ratio);
        return this;
    }

    getCanvas() {
        return this._canvas;
    }

    // Letterboxed display area (virtual ratio). The virtual gamepad injects
    // its touch overlay here so it follows the same letterbox as the canvas.
    getDisplay() {
        return this._display;
    }

    getRatio() {
        return this._ratio;
    }

    // Width/height aspect of the surface the screen-space overlays map onto —
    // the virtual display when one is set, the real canvas otherwise.
    getAspectRatio() {
        if (this._hasVirtualDisplay) {
            return this._virtualWidth / this._virtualHeight;
        }
        return this._screenWidth / this._screenHeight;
    }

    update() {
        this._hud.setRatio(this._ratio);
        this._hud.update();
    }

    destroyContainer() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
        }
        this._screen.removeChild(this._container);
    }

    _triggerResize() {
        const w = this._container.clientWidth;
        const h = this._container.clientHeight;
        if (w === 0 || h === 0) {
            return;
        }
        this._screenWidth = w;
        this._screenHeight = h;
        this._resize();
    }

    _resize() {
        if (this._hasVirtualDisplay) {
            this._resizeVirtualDisplay();
        }

        const viewPortWidth  = this._viewPortWidth;
        const viewPortHeight = viewPortWidth * this._screenHeight / this._screenWidth;

        this._engine.setScreen(this._screenWidth, this._screenHeight);
        this._engine.setView(-viewPortWidth / 2, viewPortWidth / 2, -viewPortHeight / 2, viewPortHeight / 2);
    }

    _resizeVirtualDisplay() {
        this._ratio = Math.min(this._screenWidth / this._virtualWidth, this._screenHeight / this._virtualHeight);

        const displayWidth  = Math.round(this._virtualWidth  * this._ratio);
        const displayHeight = Math.round(this._virtualHeight * this._ratio);

        this._display.style.width  = displayWidth + 'px';
        this._display.style.height = displayHeight + 'px';
        this._display.style.left   = Math.round((this._screenWidth  - displayWidth)  / 2) + 'px';
        this._display.style.top    = Math.round((this._screenHeight - displayHeight) / 2) + 'px';

        this._screenWidth  = displayWidth;
        this._screenHeight = displayHeight;
    }
}
