class Instance {
    constructor() {
        this._object    = null;
        this._position  = [0, 0, 0];
        this._rotation  = [0, 0, 0];
        this._trigger   = 'none';
        this._radius    = null;
        this._keyframes = [];
        this._maxTime   = 0;
        this._time      = 0;
        this._playing   = false;
        this.is_ready   = false;
    }

    _load(data, object) {
        this._object    = object;
        this._position  = data.position;
        this._rotation  = data.rotation;
        this._trigger   = data.trigger;
        this._radius    = data.radius;
        this._keyframes = data.keyframes || [];
        this._maxTime   = this._keyframes.length > 0
            ? this._keyframes[this._keyframes.length - 1].t
            : 0;
        this._time      = this._keyframes.length > 0 ? this._keyframes[0].t : 0;
        this.is_ready   = true;
    }

    isReady()   { return this.is_ready; }
    getObject() { return this._object; }

    // dt in ms, user must expose getCenterX/Y/Z(), action = E key state
    update(dt, user, action) {
        if (!this.is_ready || this._keyframes.length === 0) return;
        if (this._trigger === 'none') return;

        const inRange = this._radius !== null &&
            Math.sqrt(
                (user.getCenterX() - this._position[0]) ** 2 +
                (user.getCenterY() - this._position[1]) ** 2 +
                (user.getCenterZ() - this._position[2]) ** 2
            ) <= this._radius;

        const wasPlaying = this._playing;

        switch (this._trigger) {
            case 'loop':      this._playing = true;              break;
            case 'proximity': this._playing = inRange;           break;
            case 'action':    if (inRange && action) this._playing = true; break;
        }

        if (!wasPlaying && this._playing && this._time >= this._maxTime) {
            this._time = this._keyframes[0].t;
        }

        if (!this._playing) return;

        this._time += dt / 1000;
        if (this._time >= this._maxTime) {
            this._time = this._trigger === 'loop' ? this._time % this._maxTime : this._maxTime;
            if (this._trigger !== 'loop') this._playing = false;
        }
    }

    _interpolate() {
        if (this._keyframes.length === 0) return { translate: [0, 0, 0], rotate: [0, 0, 0] };

        let k0 = this._keyframes[0];
        let k1 = this._keyframes[this._keyframes.length - 1];
        for (let i = 0; i < this._keyframes.length - 1; i++) {
            if (this._time >= this._keyframes[i].t && this._time <= this._keyframes[i + 1].t) {
                k0 = this._keyframes[i];
                k1 = this._keyframes[i + 1];
                break;
            }
        }

        if (k0 === k1 || k1.t === k0.t) return { translate: [...k0.translate], rotate: [...k0.rotate] };

        const f = (this._time - k0.t) / (k1.t - k0.t);
        return {
            translate: k0.translate.map((v, i) => v + f * (k1.translate[i] - v)),
            rotate:    k0.rotate.map((v, i)    => v + f * (k1.rotate[i]    - v)),
        };
    }

    getTransform() {
        const d = this._interpolate();
        return {
            position:     this._position,
            rotation:     this._rotation,
            deltaTranslate: d.translate,
            deltaRotate:    d.rotate,
        };
    }
}
