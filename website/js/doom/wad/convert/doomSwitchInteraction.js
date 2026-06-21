/**
 * Generic runtime switch interaction, replacing the switch_N.js files that
 * convert_wad.py generated: swaps the SW1/SW2 texture of the switch face and
 * starts the target instances (lifts, floors) on trigger.
 */
class DoomSwitchInteraction extends SwitchInteraction {
    /**
     * @param {string}      code
     * @param {string[]}    targets - codes of the instances to start on trigger ON
     * @param {string}      mode    - 'once' | 'timed' | 'toggle'
     * @param {number|null} minOnTime
     * @param {number|null} minOffTime
     */
    constructor(code, targets, mode, minOnTime, minOffTime) {
        super(code);

        this._targets      = targets;
        this._exitCallback = null;

        if (mode === 'timed') {
            this.setModeTimed(minOnTime, minOffTime);
        } else if (mode === 'toggle') {
            this.setModeToggle(minOnTime, minOffTime);
        } else {
            this.setModeOnce();
        }
    }

    setExitCallback(callback) {
        this._exitCallback = callback;
        return this;
    }

    _triggerOn(instance) {
        // Swap to SW2 only if it exists: a non-SW switch wall (or an invisible
        // USE zone with no faces) has no index-2 texture — leave the face as is
        // instead of blanking it to a null textureId.
        const obj = instance.getObject();
        const swapTo = obj.getTextureId(2);
        if (swapTo !== undefined) {
            obj.faceList.forEach(fc => { fc.textureId = swapTo; });
        }

        for (const code of this._targets) {
            loader.instances().getByCode(code).start();
        }

        if (this._exitCallback !== null) {
            this._exitCallback();
        }
    }

    _triggerOff(instance) {
        const obj = instance.getObject();
        const swapTo = obj.getTextureId(1);
        if (swapTo !== undefined) {
            obj.faceList.forEach(fc => { fc.textureId = swapTo; });
        }
    }
}
