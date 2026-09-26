/**
 * Proximity pickup interaction. When a player enters the pickup
 * Instance's radius, the effect descriptor is applied to that DoomUser through
 * DoomItemRules.applyPickup; if anything is consumed the Instance is despawned.
 * Effects that would do nothing (full health/armor, owned weapon/key) leave the
 * sprite in place, faithful to Doom.
 */
class DoomPickupInteraction extends AbstractInteraction {
    /**
     * @param {string}         code       - unique interaction code, shared with the Instance
     * @param {object}         effect     - pickup effect descriptor from the profile's thing types
     * @param {DoomSimulation} simulation - its item rules apply the pickup, it counts the item
     * @param {boolean}        countsItem - counts towards the level's item score
     */
    constructor(code, effect, simulation, countsItem = false) {
        super();
        this._code       = code;
        this._effect     = effect;
        this._simulation = simulation;
        this._countsItem = (countsItem === true);
    }

    get code() {
        return this._code;
    }

    // The engine hands the user whose body entered the radius; a dead one
    // touches nothing (P_TouchSpecialThing).
    triggered(instance, user) {
        if (user.isDead()) {
            return;
        }
        // Vanilla MF_COUNTITEM things all carry ALWAYSPICKUP: a counted item is
        // taken whatever it gives, unless it has no effect wired yet.
        const alwaysPickup = (this._countsItem && ((this._effect ?? null) !== null));
        if (!this._simulation.getItemRules().applyPickup(user, this._effect) && !alwaysPickup) {
            return;
        }
        if (this._countsItem) {
            this._simulation.addItem();
        }
        user.flashPickup();
        loader.instances().scheduleRemoval(instance);
    }
}
