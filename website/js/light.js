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

    getColorFor(pt, normal) {
        const fp = this._finalPosition;
        const dp = [fp[0] - pt[0], fp[1] - pt[1], fp[2] - pt[2]];
        const dn = Math.sqrt(dp[0]*dp[0] + dp[1]*dp[1] + dp[2]*dp[2]);

        let f = (normal[0]*dp[0] + normal[1]*dp[1] + normal[2]*dp[2]);
        if (f < 0.) f = 0.;
        else if (dn) f /= dn;

        if (this.range) {
            const d = (1. - dn / this.range);
            if (d < 0.) f = 0.;
            else        f = f * Math.sqrt(d);
        }

        return [this.color[0]*f, this.color[1]*f, this.color[2]*f];
    }
}
