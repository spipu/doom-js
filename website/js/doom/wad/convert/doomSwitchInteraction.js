/**
 * Generic runtime switch interaction: swaps the SW1/SW2 texture of the switch
 * face and starts the target instances (lifts, floors) on trigger.
 */
class DoomSwitchInteraction extends SwitchInteraction {
    /**
     * @param {string}      code
     * @param {string[]}    targets        - codes of the instances to start on trigger ON
     * @param {string}      mode           - 'once' | 'timed' | 'toggle'
     * @param {number|null} minOnTime
     * @param {number|null} minOffTime
     * @param {object[]}    reverseTargets - {code, timeScale} of the instances started
     *                                       BACKWARD (lower-back 45, close lines shutting
     *                                       an opening door, raise lines lifting a lowered
     *                                       plat) — timeScale keeps the vanilla reverse speed
     * @param {string|null} doorVariant    - per-trigger door cycle key (anim@speed)
     * @param {int|null}    restIndex      - local texture index of the SW1 face
     * @param {int|null}    swapIndex      - local texture index of the SW2 partner
     */
    constructor(code, targets, mode, minOnTime, minOffTime, reverseTargets, doorVariant, restIndex, swapIndex) {
        super(code);

        this._targets        = targets;
        this._reverseTargets = (reverseTargets ?? []);
        this._doorVariant    = (doorVariant ?? null);
        // null on an invisible USE zone or a non-SW wall.
        this._restIndex      = (restIndex ?? null);
        this._swapIndex      = (swapIndex ?? null);
        this._exitCallback   = null;
        this._exitSecret     = false;
        this._remoteSwap     = null;
        this._remoteFaces    = null;
        this._remoteObject   = null;

        if (mode === 'timed') {
            this.setModeTimed(minOnTime, minOffTime);
        } else if (mode === 'toggle') {
            this.setModeToggle(minOnTime, minOffTime);
        } else {
            this.setModeOnce();
        }
    }

    // Exit switch (11/51): the callback receives the secret flag so the game
    // can route to the secret level (51) instead of the next sequential one.
    setExitCallback(callback, secret) {
        this._exitCallback = callback;
        this._exitSecret   = (secret === true);
        return this;
    }

    // SW graphic carried by a mover's riser (the panel had no geometry of its
    // own at build): the SW1↔SW2 swap applies to the mover's riser faces,
    // matched lazily on the linedef segment.
    // spec = {moverCode, seg: [x1, z1, x2, z2], restTexId, swapTexId}
    setRemoteSwap(spec) {
        this._remoteSwap   = (spec ?? null);
        this._remoteFaces  = null;
        this._remoteObject = null;
        return this;
    }

    // The SW1/SW2 texture swap is a side effect of the state, not a field: a
    // restored ON switch must replay it on the freshly rebuilt panel (the
    // switch instance shares the interaction's code). The panel also becomes
    // _lastInstance: a restored timed switch swaps back through it when its
    // timer expires.
    importState(state) {
        super.importState(state);
        if (this._state !== true) {
            return;
        }
        const panel = loader.instances().getByCode(this.code);
        this._lastInstance = panel;
        this._swapFaces(panel, this._swapIndex);
        this._applyRemoteSwap(true);
    }

    _triggerOn(instance) {
        // Swap to SW2 only when the panel has a partner: a non-SW switch wall
        // (or an invisible USE zone with no faces) keeps its face untouched
        // instead of being blanked to a null textureId.
        this._swapFaces(instance, this._swapIndex);
        this._applyRemoteSwap(true);

        DoomTriggerTargets.fire(this._targets, this._reverseTargets, this._doorVariant);

        if (this._exitCallback !== null) {
            this._exitCallback(this._exitSecret);
        }
    }

    _triggerOff(instance) {
        this._swapFaces(instance, this._restIndex);
        this._applyRemoteSwap(false);
    }

    _swapFaces(instance, localIndex) {
        if (localIndex === null) {
            return;
        }
        const object = instance.getObject();
        const swapTo = object.getTextureId(localIndex);
        if (swapTo === undefined) {
            return;
        }
        object.faceList.forEach((fc) => {
            fc.textureId = swapTo;
        });
        object.invalidateFaceGroups();
    }

    // Points sitting on the linedef segment within 1 cm (the riser vertices
    // are exactly on it).
    static get REMOTE_SWAP_EPS_SQ() {
        return 0.0001;
    }

    _applyRemoteSwap(on) {
        if (this._remoteSwap === null) {
            return;
        }
        if (this._remoteFaces === null) {
            this._remoteFaces = this._findRemoteFaces();
        }
        const texId = ((on) ? this._remoteSwap.swapTexId : this._remoteSwap.restTexId);
        this._remoteFaces.forEach((fc) => {
            fc.textureId = texId;
        });
        this._remoteObject.invalidateFaceGroups();
    }

    // Resolves the mover object once and keeps it: the swap runs on every press.
    _findRemoteFaces() {
        const spec = this._remoteSwap;
        const obj  = loader.instances().getByCode(spec.moverCode).getObject();
        this._remoteObject = obj;
        const [x1, z1, x2, z2] = spec.seg;
        const onSeg = (p) => (WadGeometry.pointSegmentDistSq(p[0], p[2], x1, z1, x2, z2)
            < DoomSwitchInteraction.REMOTE_SWAP_EPS_SQ);

        return obj.faceList.filter((fc) => (fc.textureId === spec.restTexId)
            && fc.pts.every((pi) => onSeg(obj.ptOrigin[pi])));
    }
}
