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
     * @param {string[]} reverseTargets - codes of the instances started BACKWARD
     *                                    (close lines shutting an opening door)
     * @param {boolean}  stop           - true = crossing PAUSES the targets in place
     *                                    (vanilla EV_StopPlat stasis) instead of
     *                                    starting them (specials 54/89)
     */
    constructor(code, targets, reverseTargets, stop) {
        super();
        this._code           = code;
        this._targets        = targets;
        this._reverseTargets = (reverseTargets ?? []);
        this._stop           = (stop === true);
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
        for (const code of this._targets) {
            const target = loader.instances().getByCode(code);
            if (target) {
                if (this._stop) {
                    target.pause();
                } else {
                    target.start();
                }
            }
        }
        for (const code of this._reverseTargets) {
            const target = loader.instances().getByCode(code);
            if (target) {
                target.startReverse();
            }
        }

        if (this._exitCallback !== null) {
            this._exitCallback(this._exitSecret);
        }
    }
}
