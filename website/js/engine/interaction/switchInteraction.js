class SwitchInteraction extends AbstractInteraction {
    constructor(code) {
        super();
        this._code         = code;
        this._state        = false;
        this._onTimer      = 0;
        this._done         = false;
        this._lastInstance = null;
        this.setModeOnce();
    }

    get code() {
        return this._code;
    }

    setModeToggle(minOnTime, minOffTime) {
        this._mode       = 'toggle';
        this._minOnTime  = minOnTime;
        this._minOffTime = minOffTime;
        return this;
    }

    setModeTimed(minOnTime, minOffTime) {
        this._mode       = 'timed';
        this._minOnTime  = minOnTime;
        this._minOffTime = minOffTime;
        return this;
    }

    setModeOnce() {
        this._mode       = 'once';
        this._minOnTime  = null;
        this._minOffTime = null;
        return this;
    }

    triggered(instance) {
        if (this._done) {
            return;
        }

        const minTime = ((this._state) ? this._minOnTime : this._minOffTime);
        if (this._mode !== 'once' && this._onTimer < minTime) {
            return;
        }

        if (this._mode === 'timed' && this._state) {
            return;
        }

        this._state   = !this._state;
        this._onTimer = 0;
        if (this._mode === 'once') {
            this._done = true;
        }

        if (this._state) {
            this._triggerOn(instance);
        } else {
            this._triggerOff(instance);
        }
        this._lastInstance = instance;
    }

    update(dt) {
        this._onTimer += dt;

        if (this._mode === 'timed' && this._state && this._onTimer >= this._minOnTime) {
            this._state   = false;
            this._onTimer = 0;
            this._triggerOff(this._lastInstance);
        }
    }

    _triggerOn(instance) {
        console.log('[SwitchInteraction] ' + instance.getCode() + ' -> ON');
    }

    _triggerOff(instance) {
        console.log('[SwitchInteraction] ' + instance.getCode() + ' -> OFF');
    }
}
