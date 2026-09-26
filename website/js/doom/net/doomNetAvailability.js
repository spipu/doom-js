/**
 * Whether this device can take part in a session: every session renders with
 * WebGL, and pairing reads the other side's code with the camera. The camera
 * probe only settles once the page is visible: the menus never wait on it,
 * they grey their entries when it answers, and a probe still silent after
 * PROBE_WAIT_MS lets the flow go on — the pairing then reports a missing
 * camera itself.
 */
class DoomNetAvailability {
    /**
     * @param {DoomNetLinks} links
     */
    constructor(links) {
        this._links  = links;
        this._reason = null;
    }

    /**
     * @returns {Promise<string|null>} why the device cannot play (NO_WEBGL, NO_CAMERA), null when it can
     */
    unavailableReason() {
        if (this._reason === null) {
            this._reason = this._probe();
        }

        return this._reason;
    }

    async _probe() {
        if (!new Object3dRendererWebGL().isAvailable()) {
            return DoomNetAvailability.NO_WEBGL;
        }
        if (this._links.needsCamera() && !(await DoomNetAvailability._cameraWithin(DoomNetAvailability.PROBE_WAIT_MS))) {
            return DoomNetAvailability.NO_CAMERA;
        }

        return null;
    }

    // An unanswered probe counts as a camera: the pairing opens it and says so if it fails.
    static _cameraWithin(ms) {
        return Promise.race([CameraProbe.isAvailable(), new Promise((resolve) => setTimeout(() => resolve(true), ms))]);
    }
}

DoomNetAvailability.NO_WEBGL      = 'webgl';
DoomNetAvailability.NO_CAMERA     = 'camera';
DoomNetAvailability.PROBE_WAIT_MS = 2000;
