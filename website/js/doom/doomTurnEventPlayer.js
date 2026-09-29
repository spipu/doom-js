/**
 * Plays the turn events on this device, the same on every one: the sounds,
 * the effects and the decals of the level shown, and the telezoom when the
 * viewed player is the one teleported.
 */
class DoomTurnEventPlayer {
    /**
     * @param {DoomEffects}     effects
     * @param {DoomDecals|null} decals             - null while the decal graphics are not decoded
     * @param {DoomUser}        viewer             - the viewed player's body
     * @param {function}        onViewerTeleported
     */
    constructor(effects, decals, viewer, onViewerTeleported) {
        this._effects            = effects;
        this._decals             = decals;
        this._viewer             = viewer;
        this._onViewerTeleported = onViewerTeleported;
    }

    /**
     * @param {object} event a DoomTurnEvents event
     */
    play(event) {
        switch (event.type) {
            case DoomTurnEvents.SOUND_AT:
                doomSound.playAt(event.name, event.point, event.options);
                break;
            case DoomTurnEvents.SOUND_FROM_BODY:
                doomSound.playAt(event.name, event.body.getInstance().getWorldCenter(), event.options);
                break;
            case DoomTurnEvents.SOUND_FROM_PLAYER:
                doomSound.playFromPlayer(event.name, event.user, event.channel);
                break;
            case DoomTurnEvents.SOUND_TO_PLAYER:
                doomSound.playToPlayer(event.name, event.user);
                break;
            case DoomTurnEvents.EFFECT:
                this._effects.spawn(event);
                break;
            case DoomTurnEvents.DECAL:
                if (this._decals !== null) {
                    this._decals.place(event);
                }
                break;
            case DoomTurnEvents.PLAYER_TELEPORTED:
                if (event.user === this._viewer) {
                    this._onViewerTeleported();
                }
                break;
        }
    }
}
