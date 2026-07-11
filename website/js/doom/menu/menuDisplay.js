/**
 * Virtual 1920x1080 letterboxed screen for the DOM menus.
 * Transposition of the GameDisplay.resize() mechanism of escape-game:
 * the container is letterboxed in JS, and its font-size is scaled by the
 * ratio - all the menu CSS is expressed in em, so the whole display stays
 * proportional at any window size.
 */
class MenuDisplay {
    /**
     * @param {string} screenId
     */
    constructor(screenId) {
        this._screen       = document.getElementById(screenId);
        this._width        = 1920;
        this._height       = 1080;
        this._baseFontSize = 33.;
        this._ratio        = 1.;
        this._container    = null;
        this._resizeProxy  = this._resizeWait.bind(this);
    }

    init() {
        this._container = document.createElement('div');
        this._container.className = 'doom-menu-display';
        this._screen.appendChild(this._container);

        this.resize();
        window.addEventListener('resize', this._resizeProxy);

        return this;
    }

    getContainer() {
        return this._container;
    }


    resize() {
        if (this._container === null) {
            return;
        }

        const maxW = window.innerWidth;
        const maxH = window.innerHeight;

        if (maxW * this._height < maxH * this._width) {
            this._ratio = maxW / this._width;
            this._container.style.width  = maxW + 'px';
            this._container.style.height = (maxW * this._height / this._width) + 'px';
        } else {
            this._ratio = maxH / this._height;
            this._container.style.width  = (maxH * this._width / this._height) + 'px';
            this._container.style.height = maxH + 'px';
        }

        this._container.style.fontSize = (this._baseFontSize * this._ratio) + 'px';
    }

    destroy() {
        window.removeEventListener('resize', this._resizeProxy);

        if (this._container !== null) {
            this._container.remove();
            this._container = null;
        }
    }

    // --- Internal ---

    _resizeWait() {
        setTimeout(this.resize.bind(this), 250);
    }
}
