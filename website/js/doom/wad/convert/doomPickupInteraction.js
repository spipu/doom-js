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
     * @param {string}   code   - unique interaction code, shared with the Instance
     * @param {object}   effect - pickup effect descriptor from DoomThingCatalog
     * @param {DoomGame} game   - exposes applyPickup(user, effect)
     */
    constructor(code, effect, game) {
        super();
        this._code   = code;
        this._effect = effect;
        this._game   = game;
    }

    get code() {
        return this._code;
    }

    triggered(instance) {
        const user = loader.world().get().getUser();
        if (this._game.applyPickup(user, this._effect)) {
            loader.instances().scheduleRemoval(instance);
        }
    }
}
