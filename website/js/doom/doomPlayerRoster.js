/**
 * The players of a game, looked up by id, one of them being the local player
 * (the one this device samples and views). A single-player game holds its
 * local player alone.
 */
class DoomPlayerRoster {
    constructor() {
        this._players = new Map();
        this._localId = null;
    }

    add(player) {
        this._players.set(player.getId(), player);

        return this;
    }

    setLocal(player) {
        this.add(player);
        this._localId = player.getId();

        return this;
    }

    /**
     * @returns {DoomPlayer}
     */
    getLocal() {
        return this._players.get(this._localId);
    }

    /**
     * @param {int} id
     * @returns {DoomPlayer|null}
     */
    getById(id) {
        return (this._players.get(id) ?? null);
    }

    /**
     * @returns {DoomPlayer[]} in joining order
     */
    getAll() {
        return Array.from(this._players.values());
    }
}
