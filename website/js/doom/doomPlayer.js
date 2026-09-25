/**
 * One player of the game, across its levels: the body the level builds for it
 * (a DoomUser, new on every level), its weapon controller, and the equipment
 * that outlives a level — the state it entered the level with (a restart
 * replays it) and the state it carries into the next one.
 */
class DoomPlayer {
    /**
     * @param {int} id - unique within the game, stable for its whole length
     */
    constructor(id) {
        this._id           = id;
        this._user         = null;
        this._weapon       = null;
        this._entryState   = null;
        this._carriedState = null;
        this._restartState = null;
    }

    getId() {
        return this._id;
    }

    /**
     * @returns {DoomUser|null} the body of the current level, null before the first one
     */
    getUser() {
        return this._user;
    }

    /**
     * The body of a new level: its weapon controller is dropped, the level builds another.
     *
     * @param {DoomUser} user
     */
    enterLevel(user) {
        this._user   = user;
        this._weapon = null;

        return this;
    }

    /**
     * @returns {DoomPlayerWeapon|null} null while the player owns no weapon
     */
    getWeapon() {
        return this._weapon;
    }

    setWeapon(weapon) {
        this._weapon = weapon;

        return this;
    }

    isDead() {
        return this._user.isDead();
    }

    // Snapshot of the equipment once the level has handed it out: what a restart replays.
    markLevelEntry() {
        this._entryState = this._user.exportState();

        return this;
    }

    requestRestart() {
        this._restartState = this._entryState;

        return this;
    }

    /**
     * Fixes what the player takes into the level about to be built: the entry
     * state of a restart, else its current equipment — nothing when dead
     * (G_DoLoadLevel PST_DEAD → PST_REBORN). Before the first level, nothing.
     */
    packForNextLevel() {
        if (this._restartState !== null) {
            this._carriedState = this._restartState;
            this._restartState = null;
            return this;
        }
        if (this._user !== null) {
            this._carriedState = ((this.isDead()) ? null : this._user.exportState());
        }

        return this;
    }

    /**
     * @returns {object|null} the equipment carried into the level, null for a fresh loadout
     */
    getCarriedState() {
        return this._carriedState;
    }
}
