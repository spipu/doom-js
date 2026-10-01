/**
 * The players of a session as the lobby lists them, in slot order: id,
 * nickname, ping, whether its page is away, and the slot each one keeps for
 * the whole session — the lowest free one when it joins, so a player's slot
 * never moves when someone above it leaves. A player lost against its will
 * leaves a seat reserved in its slot, which only a newcomer of the same
 * nickname takes back, any other only once no slot is free. Held by the main,
 * mirrored on every sub from the lobby messages.
 */
class DoomNetLobby {
    /**
     * @param {int} capacity - main included (the profile's maxPlayers)
     */
    constructor(capacity) {
        this._capacity = capacity;
        this._players  = [];
        this._reserved = [];     // {slot, nickname, color} of the seats kept for lost players, in slot order
        this._colors   = null;   // CSS colour per slot, null while the players have no colour
    }

    /**
     * @param {string[]|null} colors - index 0 = slot 1, null for none
     */
    setColors(colors) {
        this._colors = colors;
        for (const player of [...this._players, ...this._reserved]) {
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

    /**
     * @param {int}    id
     * @param {string} nickname
     * @param {int}    slot     - from claimSeat, the lowest free one by default
     */
    addPlayer(id, nickname, slot = this._lowestFreeSlot()) {
        this._players.push({id: id, slot: slot, nickname: nickname, ping: null, away: false, color: this._colorOf(slot)});
        this._players.sort((a, b) => (a.slot - b.slot));

        return this;
    }

    remove(id) {
        this._players = this._players.filter((player) => (player.id !== id));

        return this;
    }

    // The player leaves its seat reserved behind it.
    reserve(id) {
        const player = this.getPlayer(id);
        if (player === null) {
            return this;
        }
        this.remove(id);
        this._reserved.push({slot: player.slot, nickname: player.nickname, color: player.color});
        this._reserved.sort((a, b) => (a.slot - b.slot));

        return this;
    }

    /**
     * The slot a newcomer takes: the seat reserved for its nickname, else the
     * lowest free slot, else the lowest reserved seat, whose player loses it.
     *
     * @param {string} nickname
     * @returns {{slot: int, released: int|null}} released: the slot of the seat lost
     */
    claimSeat(nickname) {
        const own = (this._reserved.find((seat) => (seat.nickname === nickname)) ?? null);
        if (own !== null) {
            this._unreserve(own.slot);
            return {slot: own.slot, released: null};
        }
        const free = this._lowestFreeSlot();
        if ((free <= this._capacity) || (this._reserved.length === 0)) {
            return {slot: free, released: null};
        }
        const lost = this._reserved[0].slot;
        this._unreserve(lost);

        return {slot: lost, released: lost};
    }

    /**
     * @returns {int[]} the slots of the seats that were reserved, all released now
     */
    releaseSeats() {
        const slots = this._reserved.map((seat) => seat.slot);
        this._reserved = [];

        return slots;
    }

    getReserved() {
        return this._reserved;
    }

    hasReservations() {
        return (this._reserved.length > 0);
    }

    _unreserve(slot) {
        this._reserved = this._reserved.filter((seat) => (seat.slot !== slot));
    }

    setPing(id, ping) {
        const player = this.getPlayer(id);
        if (player !== null) {
            player.ping = ping;
        }

        return this;
    }

    setAway(id, away) {
        const player = this.getPlayer(id);
        if (player !== null) {
            player.away = away;
        }

        return this;
    }

    getPlayer(id) {
        return (this._players.find((player) => (player.id === id)) ?? null);
    }

    getPlayerInSlot(slot) {
        return (this._players.find((player) => (player.slot === slot)) ?? null);
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
        return {
            capacity: this._capacity,
            players:  this._players.map((player) => Object.assign({}, player)),
            reserved: this._reserved.map((seat) => Object.assign({}, seat))
        };
    }

    // The mirror of a sub: the main's lobby replaces its own.
    load(data) {
        this._capacity = data.capacity;
        this._players  = data.players;
        this._reserved = data.reserved;

        return this;
    }

    // Past the capacity when every slot is taken or reserved.
    _lowestFreeSlot() {
        const taken = new Set([...this._players, ...this._reserved].map((seat) => seat.slot));
        let slot = 1;
        while (taken.has(slot)) {
            slot++;
        }

        return slot;
    }
}

DoomNetLobby.MAIN_ID = 0;
