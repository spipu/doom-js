/**
 * Walk-trigger interaction: when the player crosses a walk-over zone, it start()s
 * its target instances (tagged lifts / floors / doors) — the same "trigger →
 * targets" idea as a switch, but proximity-activated and with no texture swap.
 * The W1 (once) vs WR (repeatable) distinction is carried by the zone Instance's
 * onlyOnce flag; start() is idempotent so re-firing while standing in the zone is
 * harmless.
 * A walk-over exit zone (52/124) has no targets and fires the exit callback
 * instead (protected against re-entry by the game's _transitioning guard).
 */
class DoomWalkTriggerInteraction extends AbstractInteraction {
    /**
     * @param {string}   code           - unique interaction code, shared with the Instance
     * @param {string[]} targets        - codes of the instances to start on cross
     * @param {object[]} reverseTargets - {code, timeScale} of the instances started
     *                                    BACKWARD (close lines shutting an opening
     *                                    door, raise lines lifting a lowered plat) —
     *                                    timeScale keeps the vanilla reverse speed
     * @param {boolean}  stop           - true = crossing PAUSES the targets in place
     *                                    (vanilla EV_StopPlat stasis) instead of
     *                                    starting them (specials 54/89)
     * @param {string|null} cycleVariant  - keyframe variant selected on the targets
     *                                    (per-trigger door cycles: OWC vs open-stay
     *                                    on the same tag) — ignored by targets
     *                                    without variants
     */
    constructor(code, targets, reverseTargets, stop, cycleVariant) {
        super();
        this._code           = code;
        this._targets        = targets;
        this._reverseTargets = (reverseTargets ?? []);
        this._stop           = (stop === true);
        this._cycleVariant   = (cycleVariant ?? null);
        this._exitCallback   = null;
        this._exitSecret     = false;
    }

    get code() {
        return this._code;
    }

    // Walk-over exit (52/124): crossing the zone ends the level. The callback
    // receives the secret flag so the game can route to the secret level.
    setExitCallback(callback, secret) {
        this._exitCallback = callback;
        this._exitSecret   = (secret === true);
        return this;
    }

    triggered(instance) {
        if (this._stop) {
            DoomTriggerTargets.pause(this._targets);
        } else {
            DoomTriggerTargets.fire(this._targets, this._reverseTargets, this._cycleVariant);
        }

        if (this._exitCallback !== null) {
            this._exitCallback(this._exitSecret);
        }
    }
}
