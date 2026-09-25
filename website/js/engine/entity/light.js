class Light {
    constructor(color, range, position) {
        this.color          = color;
        this.range          = range;
        this.position       = position;
        this._finalPosition = [position[0], position[1], position[2], 1];
    }

    setPosition(position) {
        this.position = position;
    }

    setColor(color) {
        this.color = color;
    }

    setRange(range) {
        this.range = range;
    }

    calculateFinalPosition(matrix) {
        this._finalPosition = matrix.multiplyPosition(
            [this.position[0], this.position[1], this.position[2], 1]
        );
    }

    getColorFor(pt, normal, out) {
        const fp = this._finalPosition;
        const dpx = fp[0] - pt[0], dpy = fp[1] - pt[1], dpz = fp[2] - pt[2];
        const dist = Math.sqrt(dpx*dpx + dpy*dpy + dpz*dpz);

        let intensity = (normal[0]*dpx + normal[1]*dpy + normal[2]*dpz);
        if (intensity < 0.) {
            intensity = 0.;
        } else if (dist) {
            intensity /= dist;
        }

        if (this.range) {
            const falloff = (1. - dist / this.range);
            if (falloff < 0.) {
                intensity = 0.;
            } else {
                intensity = intensity * Math.sqrt(falloff);
            }
        }

        out[0] = this.color[0]*intensity;
        out[1] = this.color[1]*intensity;
        out[2] = this.color[2]*intensity;
    }
}
