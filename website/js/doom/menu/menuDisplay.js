/**
 * Virtual 1920x1080 letterboxed screen for the DOM menus: the container is
 * letterboxed in JS and its font-size scaled by the ratio, so the em-based menu
 * CSS stays proportional at any window size.
 */
class MenuDisplay {
    /**
     * @param {string} screenId
     */
    constructor(screenId) {
        this._screen         = document.getElementById(screenId);
        this._width          = 1920;
        this._height         = 1080;
        this._baseFontSize   = 33.;
        this._ratio          = 1.;
        this._container      = null;
        this._resizeListener = this._resizeDelayed.bind(this);
    }

    /**
     * @param {boolean} overGame true = transparent display pinned over the
     *                           running game (pause menu), instead of the
     *                           opaque standalone menu background
     */
    init(overGame = false) {
        // A re-boot (loading a save from the WAD menu) must not stack a second
        // container: the orphan would push the new menu aside.
        this.destroy();

        this._container = document.createElement('div');
        this._container.className = 'doom-menu-display' + ((overGame) ? ' doom-menu-display-over-game' : '');
        this._screen.appendChild(this._container);

        this.resize();
        window.addEventListener('resize', this._resizeListener);

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
            this._ratio                  = maxW / this._width;
            this._container.style.width  = maxW + 'px';
            this._container.style.height = (maxW * this._height / this._width) + 'px';
        } else {
            this._ratio                  = maxH / this._height;
            this._container.style.width  = (maxH * this._width / this._height) + 'px';
            this._container.style.height = maxH + 'px';
        }

        this._container.style.fontSize = (this._baseFontSize * this._ratio) + 'px';
    }

    destroy() {
        window.removeEventListener('resize', this._resizeListener);

        if (this._container !== null) {
            this._container.remove();
            this._container = null;
        }
    }

    // --- Internal ---

    _resizeDelayed() {
        setTimeout(this.resize.bind(this), 250);
    }
}
