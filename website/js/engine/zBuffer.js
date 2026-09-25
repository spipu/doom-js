class ZBuffer {
    constructor() {
        this._width  = 0;
        this._height = 0;
        this._near   = 1;
        this._far    = 80;
        this._depths = [];
    }

    setRange(near, far) {
        this._near = near;
        this._far  = far;
    }

    getNear() {
        return this._near;
    }

    getFar() {
        return this._far;
    }

    clear(width, height) {
        this._width  = width;
        this._height = height;
        this._depths = new Array(width * height).fill(this._far);
    }

    // Depth test without writing, for surfaces that must not hide what lies
    // behind them (additive glows).
    test(x, y, z) {
        if ((x < 0) || (y < 0)) {
            return false;
        }
        if ((x > this._width - 1) || (y > this._height - 1)) {
            return false;
        }
        if ((z < this._near) || (z > this._far)) {
            return false;
        }

        return (this._depths[x + y * this._width] >= z);
    }

    set(x, y, z) {
        if (!this.test(x, y, z)) {
            return false;
        }
        this._depths[x + y * this._width] = z;
        return true;
    }
}
