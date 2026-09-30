/**
 * The visible body of one player in a cooperative game, as the other players
 * see it: a body view posed at the player's feet every turn, turned with its
 * look, squashed with its crouch, and animated by the profile's player states
 * at 35 tics a second — walking while its command moves it (P_XYMovement),
 * attacking on each shot (P_FireWeapon) and with the muzzle flash (A_GunFlash),
 * in pain on any loss of health, dying or gibbed. Runs on the main alone and
 * draws no random number: the game's sequence never shifts.
 */
class DoomPlayerBody {
    /**
     * @param {DoomPlayer}     player
     * @param {DoomMonsterDef} def       - the profile's player body
     * @param {object}         frames    - the views of the player's slot (DoomBuiltLevel.getPlayerBodyFrames)
     * @param {object}         levelData - the monster level data, for its sector locator
     */
    constructor(player, def, frames, levelData) {
        this._player     = player;
        this._def        = def;
        this._levelData  = levelData;
        this._view       = new DoomBodyView(DoomPlayerBody._spawn(frames, player.getUser()), frames, DoomPlayerBody.kindOf(player.getId()))
            .setPlayerId(player.getId());
        this._stateKey   = null;
        this._ticsLeft   = 0;
        this._clockMs    = 0;
        this._dying      = false;
        this._lastEnergy = player.getUser().getEnergy();
        this._fired      = false;
        this._flashed    = false;
        this._enter(DoomPlayerBody.SPAWN);
    }

    /**
     * @param {int} slot
     * @returns {string} the body kind of that slot's player
     */
    static kindOf(slot) {
        return DoomPlayerBody.KIND_PREFIX + slot;
    }

    /**
     * @param {int} slot
     * @returns {string} the kind of the corpse a dead player of that slot left
     */
    static corpseKindOf(slot) {
        return DoomPlayerBody.CORPSE_PREFIX + slot;
    }

    /**
     * @param {string} kind
     * @returns {int|null} the slot of a player body's or corpse's kind, null for any other body
     */
    static slotOf(kind) {
        const prefix = [DoomPlayerBody.KIND_PREFIX, DoomPlayerBody.CORPSE_PREFIX].find((candidate) => kind.startsWith(candidate));

        return ((prefix !== undefined) ? Number(kind.slice(prefix.length)) : null);
    }

    /**
     * @param {string} kind
     * @returns {int|null} the player id of a player body's kind, null for any other body, a corpse included
     */
    static playerIdOf(kind) {
        return ((kind.startsWith(DoomPlayerBody.KIND_PREFIX)) ? Number(kind.slice(DoomPlayerBody.KIND_PREFIX.length)) : null);
    }

    getView() {
        return this._view;
    }

    // The weapon started an attack (the weapon controller's fire callback).
    fired() {
        this._fired = true;
    }

    // The muzzle flash lit (the weapon controller's flash callback).
    flashed() {
        this._flashed = true;
    }

    /**
     * One turn: what the player did picks the state, the tics run, the body
     * follows the player.
     *
     * @param {number}      dtMs
     * @param {UserCommand} command - the player's for the turn
     */
    update(dtMs, command) {
        this._react(command);
        this._clockMs += dtMs;
        while (this._clockMs >= WadConstants.MS_PER_TIC) {
            this._clockMs -= WadConstants.MS_PER_TIC;
            this._tic();
        }
        this._pose();
    }

    _react(command) {
        const user   = this._player.getUser();
        const energy = user.getEnergy();
        if (user.isDead()) {
            if (!this._dying) {
                this._dying = true;
                this._enter(((user.getLastOverkill() > this._def.getHealth()) ? DoomPlayerBody.XDEATH : DoomPlayerBody.DEATH));
            }
        } else {
            this._reactAlive(command, energy);
        }
        this._lastEnergy = energy;
        this._fired      = false;
        this._flashed    = false;
    }

    // The flash comes on the shot's own tic: its state wins, as the vanilla
    // A_GunFlash overrides the P_FireWeapon one.
    _reactAlive(command, energy) {
        if (energy < this._lastEnergy) {
            this._enter(DoomPlayerBody.PAIN);
        }
        if (this._flashed) {
            this._enter(DoomPlayerBody.MELEE);
        } else if (this._fired) {
            this._enter(DoomPlayerBody.MISSILE);
        }
        const moving = ((command.getMoveX() !== 0) || (command.getMoveY() !== 0));
        if (moving && this._inGroup(DoomPlayerBody.SPAWN)) {
            this._enter(DoomPlayerBody.SEE);
        } else if (!moving && this._inGroup(DoomPlayerBody.SEE)) {
            this._enter(DoomPlayerBody.SPAWN);
        }
    }

    _inGroup(group) {
        return this._stateKey.startsWith(group);
    }

    // A group starts at its first state; a state of 0 tics is a step of the
    // same tic (P_SetMobjState).
    _enter(group) {
        this._enterState(group + DoomPlayerBody.FIRST_STATE);
    }

    _enterState(key) {
        let next  = key;
        let guard = 0;
        while ((next !== null) && (guard < DoomPlayerBody.STATE_CHAIN_GUARD)) {
            guard++;
            const state = this._def.getState(next);
            this._stateKey = next;
            this._ticsLeft = state.getTics();
            if (this._ticsLeft !== 0) {
                return;
            }
            next = state.getNext();
        }
    }

    // A terminal state (-1) holds; a finite last state with no follow-up too.
    _tic() {
        const state = this._def.getState(this._stateKey);
        if (state.getTics() < 0) {
            return;
        }
        this._ticsLeft--;
        if ((this._ticsLeft <= 0) && (state.getNext() !== null)) {
            this._enterState(state.getNext());
        }
    }

    _pose() {
        const user = this._player.getUser();
        this._view.getInstance().setPose([user.x, user.y, user.z], DoomPlayerBody.NO_DELTA, DoomPlayerBody.NO_DELTA);
        this._view.showState(this._def.getState(this._stateKey), WadGeometry.doomAngleYaw(user.yaw), this._sectorAt(user))
            .setRenderScale(user.getCurrentHeight() / user.getHeight());
    }

    _sectorAt(user) {
        const sector = this._levelData.findSector(user.x / WadConstants.SCALE, user.z / WadConstants.SCALE);

        return ((sector !== null) ? sector.si : null);
    }

    static _spawn(frames, user) {
        const objId = frames[Object.keys(frames)[0]][0];

        return loader.instances().get(loader.instances().spawnFromData(null, {
            object:         objId,
            position:       [user.x, user.y, user.z],
            rotation:       [0, 0, 0],
            trigger:        'none',
            loop:           false,
            onlyOnce:       false,
            collisionShape: 'none',
            keyframes:      []
        }));
    }
}

DoomPlayerBody.KIND_PREFIX   = 'player';
DoomPlayerBody.CORPSE_PREFIX = 'corpse';
// The state groups of the profile's player body (zscript PlayerPawn).
DoomPlayerBody.SPAWN   = 'spawn';
DoomPlayerBody.SEE     = 'see';
DoomPlayerBody.MISSILE = 'missile';
DoomPlayerBody.MELEE   = 'melee';
DoomPlayerBody.PAIN    = 'pain';
DoomPlayerBody.DEATH   = 'death';
DoomPlayerBody.XDEATH  = 'xdeath';
DoomPlayerBody.FIRST_STATE       = '0';
DoomPlayerBody.STATE_CHAIN_GUARD = 16;
DoomPlayerBody.NO_DELTA = [0, 0, 0];
