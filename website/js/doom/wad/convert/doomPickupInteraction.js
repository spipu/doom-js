/**
 * Proximity pickup interaction (phase 3). When the player enters the pickup
 * Instance's radius, the effect descriptor is applied to the DoomUser through
 * DoomGame.applyPickup; if anything is consumed the Instance is despawned.
 * Effects that would do nothing (full health/armor, owned weapon/key) leave the
 * sprite in place, faithful to Doom. The game reference carries the catalogs
 * (ammo caps, weapon/item definitions) and the active skill.
 */
class DoomPickupInteraction extends AbstractInteraction {
    /**
     * @param {string}   code       - unique interaction code, shared with the Instance
     * @param {object}   effect     - pickup effect descriptor from the profile's thing types
     * @param {DoomGame} game       - exposes applyPickup(user, effect)
     * @param {boolean}  countsItem - counts towards the level's item score
     */
    constructor(code, effect, game, countsItem = false) {
        super();
        this._code       = code;
        this._effect     = effect;
        this._game       = game;
        this._countsItem = (countsItem === true);
    }

    get code() {
        return this._code;
    }

    triggered(instance) {
        const user = loader.world().get().getUser();
        // A counted item is taken whatever it gives: the vanilla MF_COUNTITEM
        // things all carry ALWAYSPICKUP too, so an armor bonus at 200 vanishes
        // and still scores. An artifact with no effect wired yet is the one
        // exception — it would disappear for nothing. Everything else keeps the
        // refusal rule above.
        const alwaysPickup = (this._countsItem && ((this._effect ?? null) !== null));
        if (!this._game.applyPickup(user, this._effect) && !alwaysPickup) {
            return;
        }
        if (this._countsItem) {
            this._game.addItem();
        }
        user.flashPickup();
        loader.instances().scheduleRemoval(instance);
    }
}
