class ScreenManager {
    constructor(engine, hud, options) {
        this._engine     = engine;
        this._canvas     = engine.scrCanvas;
        this._hud        = hud;
        this._fullscreen     = (options.fullscreen === true);
        this._screenWidth    = options.width ?? null;
        this._screenHeight   = options.height ?? null;
        this._viewPortWidth  = options.viewPortWidth ?? 64;

        this._container = document.createElement('div');
        this._container.style.position = ((this._fullscreen) ? 'fixed' : 'relative');
        this._container.style.display  = ((this._fullscreen) ? 'block'  : 'inline-block');

        if (this._fullscreen) {
            this._container.style.top    = '0';
            this._container.style.left   = '0';
            this._container.style.width  = '100vw';
            this._container.style.height = '100vh';
        }

        this._canvas.parentNode.replaceChild(this._container, this._canvas);
        this._container.appendChild(this._canvas);

        if (this._fullscreen) {
            this._canvas.style.display = 'block';
            this._canvas.style.width   = '100%';
            this._canvas.style.height  = '100%';
        }

        this._initHudOverlay();

        if (this._fullscreen) {
            this._resizeObserver = new ResizeObserver(() => {
                this._triggerResize();
            });
            this._resizeObserver.observe(this._container);
            this._triggerResize();
        } else {
            this._resize();
        }
    }

    _initHudOverlay() {
        this._hudEl = document.createElement('div');
        this._hudEl.style.position      = 'absolute';
        this._hudEl.style.top           = '0';
        this._hudEl.style.left          = '0';
        this._hudEl.style.width         = '100%';
        this._hudEl.style.height        = '100%';
        this._hudEl.style.pointerEvents = 'none';
        this._container.appendChild(this._hudEl);

        this._hud.init(this._hudEl);
    }

    update() {
        this._hud.update();
    }

    destroyContainer() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
        }
        this._container.parentNode.insertBefore(this._canvas, this._container);
        this._container.parentNode.removeChild(this._container);
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
        const viewPortWidth  = this._viewPortWidth;
        const viewPortHeight = viewPortWidth * this._screenHeight / this._screenWidth;

        this._engine.setScreen(this._screenWidth, this._screenHeight);
        this._engine.setView(-viewPortWidth / 2, viewPortWidth / 2, -viewPortHeight / 2, viewPortHeight / 2);
    }
}
