/**
 * Walk-trigger interaction: when the player crosses a walk-over zone, it start()s
 * its target instances (tagged lifts / floors / doors) — the same "trigger →
 * targets" idea as a switch, but proximity-activated and with no texture swap.
 * The W1 (once) vs WR (repeatable) distinction is carried by the zone Instance's
 * onlyOnce flag; start() is idempotent so re-firing while standing in the zone is
 * harmless.
 */
class DoomWalkTriggerInteraction extends AbstractInteraction {
    /**
     * @param {string}   code    - unique interaction code, shared with the Instance
     * @param {string[]} targets - codes of the instances to start on cross
     */
    constructor(code, targets) {
        super();
        this._code    = code;
        this._targets = targets;
    }

    get code() {
        return this._code;
    }

    triggered(instance) {
        for (const code of this._targets) {
            const target = loader.instances().getByCode(code);
            if (target) {
                target.start();
            }
        }
    }
}
