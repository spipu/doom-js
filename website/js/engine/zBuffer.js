class ZBuffer {
    constructor() {
        this._width  = 0;
        this._height = 0;
        this._z_near = 1;
        this._z_far  = 80;
        this._data   = [];
    }

    setRange(z_near, z_far) {
        this._z_near = z_near;
        this._z_far  = z_far;
    }

    getNear() {
        return this._z_near;
    }

    getFar() {
        return this._z_far;
    }

    clear(width, height) {
        this._width  = width;
        this._height = height;
        this._data   = new Array(width * height).fill(this._z_far);
    }

    // Depth test alone: what passes it is visible, but nothing is recorded —
    // for the surfaces that must not hide what lies behind them (additive
    // glows), which several of them may cover in turn.
    test(x, y, z) {
        if (x < 0 || y < 0) {
            return false;
        }
        if (x > this._width - 1 || y > this._height - 1) {
            return false;
        }
        if (z < this._z_near || z > this._z_far) {
            return false;
        }

        return (this._data[x + y * this._width] >= z);
    }

    set(x, y, z) {
        if (!this.test(x, y, z)) {
            return false;
        }
        this._data[x + y * this._width] = z;
        return true;
    }
}
