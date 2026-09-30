/**
 * The players of a session as the lobby lists them, in slot order: id,
 * nickname, ping, and the slot each one keeps for the whole session — the
 * lowest free one when it joins, so a player's slot never moves when someone
 * above it leaves. Held by the main, mirrored on every sub from the lobby
 * messages.
 */
class DoomNetLobby {
    /**
     * @param {int} capacity - main included (the profile's maxPlayers)
     */
    constructor(capacity) {
        this._capacity = capacity;
        this._players  = [];
        this._colors   = null;   // CSS colour per slot, null while the players have no colour
    }

    /**
     * @param {string[]|null} colors - index 0 = slot 1, null for none
     */
    setColors(colors) {
        this._colors = colors;
        for (const player of this._players) {
            player.color = this._colorOf(player.slot);
        }

        return this;
    }

    _colorOf(slot) {
        return ((this._colors !== null) ? (this._colors[slot - 1] ?? null) : null);
    }

    // The main holds slot 1 and player id MAIN_ID.
    addMain(nickname) {
        return this.addPlayer(DoomNetLobby.MAIN_ID, nickname);
    }

    addPlayer(id, nickname) {
        const slot = this._lowestFreeSlot();
        this._players.push({id: id, slot: slot, nickname: nickname, ping: null, color: this._colorOf(slot)});
        this._players.sort((a, b) => (a.slot - b.slot));

        return this;
    }

    remove(id) {
        this._players = this._players.filter((player) => (player.id !== id));

        return this;
    }

    setPing(id, ping) {
        const player = this.getPlayer(id);
        if (player !== null) {
            player.ping = ping;
        }

        return this;
    }

    getPlayer(id) {
        return (this._players.find((player) => (player.id === id)) ?? null);
    }

    getPlayers() {
        return this._players;
    }

    /**
     * @returns {number|null} the highest round trip among the players measured, null when none is
     */
    getWorstPing() {
        const pings = this._players.map((player) => player.ping).filter((ping) => (ping !== null));

        return ((pings.length > 0) ? Math.max(...pings) : null);
    }

    getCapacity() {
        return this._capacity;
    }

    isFull() {
        return (this._players.length >= this._capacity);
    }

    toData() {
        return {capacity: this._capacity, players: this._players.map((player) => Object.assign({}, player))};
    }

    // The mirror of a sub: the main's lobby replaces its own.
    load(data) {
        this._capacity = data.capacity;
        this._players  = data.players;

        return this;
    }

    _lowestFreeSlot() {
        const taken = new Set(this._players.map((player) => player.slot));
        let slot = 1;
        while (taken.has(slot)) {
            slot++;
        }

        return slot;
    }
}

DoomNetLobby.MAIN_ID = 0;
