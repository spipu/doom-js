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

    clear(width, height) {
        this._width  = width;
        this._height = height;
        this._data   = new Array(width * height).fill(this._z_far);
    }

    set(x, y, z) {
        if (x < 0 || y < 0)                              return false;
        if (x > this._width - 1 || y > this._height - 1) return false;
        if (z < this._z_near || z > this._z_far)         return false;

        const t = x + y * this._width;
        if (this._data[t] < z) return false;
        this._data[t] = z;
        return true;
    }
}
