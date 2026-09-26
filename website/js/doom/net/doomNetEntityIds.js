/**
 * The network ids of a level, one Uint32 space for everything the binary
 * messages name: a built entity gets the rank of its instance code in a table
 * every device builds identically (the level build is deterministic), a body
 * or a shot born in play the next value of a counter that starts past the
 * table and never rewinds within the level, so an id never names two
 * entities.
 */
class DoomNetEntityIds {
    constructor() {
        this._byCode      = null;
        this._pickupCodes = [];
        this._nextId      = 0;
    }

    /**
     * Once the level is built, before anything is removed from it (a pickup
     * taken): every device indexes the same instances.
     */
    index() {
        this._byCode      = new Map();
        this._pickupCodes = [];
        loader.instances().getAll().forEach((instance) => {
            const code = instance.getCode();
            if (code === null) {
                return;
            }
            if (code.startsWith(DoomGameSnapshot.PICKUP_PREFIX)) {
                this._pickupCodes.push(code);
            }
            this._byCode.set(code, this._byCode.size);
        });
        this._nextId = this._byCode.size;

        return this;
    }

    /**
     * @returns {int|null} the id of a built instance, null for one born in play
     */
    idOfInstance(instance) {
        return this.idOfCode(instance.getCode());
    }

    idOfCode(code) {
        return ((code !== null) ? (this._byCode.get(code) ?? null) : null);
    }

    /**
     * A body or a shot: the id of its built instance, else the one it was
     * given the first time it was named.
     *
     * @param {DoomBodyView|DoomProjectileView} view
     */
    idOfView(view) {
        const built = this.idOfInstance(view.getInstance());
        if (built !== null) {
            return built;
        }
        if (view.getNetId() === null) {
            view.setNetId(this._nextId++);
        }

        return view.getNetId();
    }

    isBornInPlay(view) {
        return (this.idOfInstance(view.getInstance()) === null);
    }

    // The map pickups, in table order: the order of the presence bits.
    getPickupCodes() {
        return this._pickupCodes;
    }
}
