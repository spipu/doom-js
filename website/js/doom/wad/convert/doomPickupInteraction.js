/**
 * Proximity pickup interaction. When a player enters the pickup
 * Instance's radius, the effect descriptor is applied to that DoomUser through
 * DoomItemRules.applyPickup; if anything is consumed the Instance is despawned
 * — unless it stays on the ground for the other players (a weapon or a key in
 * a multiplayer game). Effects that would do nothing (full health/armor, owned
 * weapon/key) leave the sprite in place, faithful to Doom. A removal is told
 * to whoever brings the items back (deathmatch).
 */
class DoomPickupInteraction extends AbstractInteraction {
    /**
     * @param {string}         code       - unique interaction code, shared with the Instance
     * @param {object}         effect     - pickup effect descriptor from the profile's thing types
     * @param {DoomItemRules}  itemRules  - applies the pickup
     * @param {DoomLevelStats} stats      - counts the item
     * @param {boolean}        countsItem - counts towards the level's item score
     */
    constructor(code, effect, itemRules, stats, countsItem = false) {
        super();
        this._code       = code;
        this._effect     = effect;
        this._itemRules  = itemRules;
        this._stats      = stats;
        this._countsItem = (countsItem === true);
        this._onRemoved  = null;
    }

    /**
     * @param {function(string|null)} callback - the code of the instance taken off the ground
     */
    setOnRemoved(callback) {
        this._onRemoved = callback;

        return this;
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
        if (!this._itemRules.applyPickup(user, this._effect) && !alwaysPickup) {
            return;
        }
        if (this._countsItem) {
            this._stats.addItem(user.getPlayerId());
        }
        user.flashPickup();
        if (this._itemRules.staysOnGround(this._effect)) {
            return;
        }
        loader.instances().scheduleRemoval(instance);
        if (this._onRemoved !== null) {
            this._onRemoved(instance.getCode());
        }
    }
}
