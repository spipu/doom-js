class Light {
    constructor(color, distance, pos) {
        this.color    = color;
        this.distance = distance;
        this.position = pos;
    }

    changePos(pos) {
        this.position = pos;
    }

    getColorFor(pt, normal) {
        const dp = [
            this.position[0] - pt[0],
            this.position[1] - pt[1],
            this.position[2] - pt[2],
        ];

        const dn = Math.sqrt(dp[0]*dp[0] + dp[1]*dp[1] + dp[2]*dp[2]);

        let f = (normal[0]*dp[0] + normal[1]*dp[1] + normal[2]*dp[2]);
        if (f < 0.) f = 0.;
        else if (dn) f /= dn;

        if (this.distance) {
            const d = (1. - dn / this.distance);
            if (d < 0.) f = 0.;
            else        f = f * Math.sqrt(d);
        }

        return [this.color[0]*f, this.color[1]*f, this.color[2]*f];
    }
}
