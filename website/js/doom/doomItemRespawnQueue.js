/**
 * The map items taken while the items respawn, on the main alone
 * (P_RemoveMobj's itemrespawnque and P_RespawnSpecials): each one comes back
 * where it was, its respawn effect and sound first, after the profile's delay;
 * the oldest is dropped when the queue overflows, the types the profile lists
 * never come back, and the items dropped by monsters never enter it.
 */
class DoomItemRespawnQueue {
    /**
     * @param {object[]}          pickups - the DoomBuiltLevel map pickup entries
     * @param {object}            rules   - AbstractGameProfile.itemRespawnRules()
     * @param {DoomEffectSpawner} effects
     * @param {DoomTurnEvents}    events
     */
    constructor(pickups, rules, effects, events) {
        this._pickups   = new Map(pickups.map((pickup) => [pickup.code, pickup]));
        this._rules     = rules;
        this._effects   = effects;
        this._events    = events;
        this._waiting   = [];   // {pickup, dueMs}, oldest first
        this._revealing = [];   // {pickup, dueMs}, its effect already played
        this._nowMs     = 0;
    }

    /**
     * @param {string|null} code - the code of the instance taken (null for a monster's drop)
     */
    taken(code) {
        const pickup = ((code !== null) ? (this._pickups.get(code) ?? null) : null);
        if ((pickup === null) || this._rules.neverTypes.includes(pickup.type)) {
            return;
        }
        this._waiting.push({pickup: pickup, dueMs: this._nowMs + (this._rules.delayTics * WadConstants.MS_PER_TIC)});
        if (this._waiting.length > DoomItemRespawnQueue.SIZE) {
            this._waiting.shift();
        }
    }

    // One item at most leaves the queue per turn, the oldest (iquetail).
    update(dt) {
        this._nowMs += dt;
        const next = (this._waiting[0] ?? null);
        if ((next !== null) && (next.dueMs <= this._nowMs)) {
            this._waiting.shift();
            this._announce(next.pickup);
            this._revealing.push({pickup: next.pickup, dueMs: this._nowMs + (this._rules.revealTics * WadConstants.MS_PER_TIC)});
        }
        while ((this._revealing.length > 0) && (this._revealing[0].dueMs <= this._nowMs)) {
            DoomPickupSpawner.respawn(this._revealing.shift().pickup);
        }
    }

    _announce(pickup) {
        const spot = DoomPickupSpawner.spotOf(pickup);
        this._effects.spawn(this._rules.effect, spot[0], spot[1], spot[2]);
        this._events.soundAt(this._rules.sound, spot);
    }
}

// itemrespawnque: ITEMQUESIZE.
DoomItemRespawnQueue.SIZE = 128;
