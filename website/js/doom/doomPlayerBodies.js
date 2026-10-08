/**
 * The players' bodies of one level, shown while the subs play their own
 * players, and the corpses the dead ones leave behind (G_PlayerReborn: the
 * body stays where it fell, at most CORPSE_QUEUE of them).
 */
class DoomPlayerBodies {
    /**
     * @param {DoomBuiltLevel} level
     */
    constructor(level) {
        this._level   = level;
        this._bodies  = new Map();   // player id → DoomPlayerBody
        this._corpses = [];          // DoomBodyView of the left bodies, oldest first
    }

    /**
     * @param {DoomPlayer[]} players
     * @param {boolean}      visible - the rules admit sub players
     */
    show(players, visible) {
        for (const player of players) {
            if (visible) {
                this.add(player);
            } else {
                this.remove(player);
            }
        }
    }

    add(player) {
        const frames = this._level.getPlayerBodyFrames(DoomPlayerBody.kindOf(player.getId()));
        if (this._bodies.has(player.getId()) || (frames === null)) {
            return;
        }
        const body = new DoomPlayerBody(player, this._level.getPlayerBodyDef(), frames, this._level.getMonsterLevelData());
        this._bodies.set(player.getId(), body);
        this._level.getBodyViews().add(body.getView());
    }

    remove(player) {
        const body = (this._bodies.get(player.getId()) ?? null);
        if (body === null) {
            return;
        }
        this._dropView(body.getView());
        this._bodies.delete(player.getId());
    }

    // The corpse keeps the slot's colour, so the respawned player sees it too.
    leaveCorpse(player) {
        const body = (this._bodies.get(player.getId()) ?? null);
        if (body === null) {
            return;
        }
        const views  = this._level.getBodyViews();
        const view   = body.getView();
        const corpse = new DoomBodyView(view.getInstance(), view.getFrames(), DoomPlayerBody.corpseKindOf(player.getId()))
            .setFrame(view.getFrameKey(), view.isBright())
            .setFacing(view.getFacing())
            .setSector(view.getSector())
            .setRenderScale(view.getRenderScale());
        views.delete(view);
        views.add(corpse);
        this._bodies.delete(player.getId());
        this._corpses.push(corpse);
        if (this._corpses.length > DoomPlayerBodies.CORPSE_QUEUE) {
            this._dropView(this._corpses.shift());
        }
    }

    fired(playerId) {
        this._bodies.get(playerId)?.fired();
    }

    flashed(playerId) {
        this._bodies.get(playerId)?.flashed();
    }

    /**
     * @param {number}                dt
     * @param {Map<int, UserCommand>} commands - by player id
     */
    update(dt, commands) {
        for (const [id, body] of this._bodies) {
            body.update(dt, (commands.get(id) ?? World.NEUTRAL_COMMAND));
        }
    }

    _dropView(view) {
        loader.instances().scheduleRemoval(view.getInstance());
        this._level.getBodyViews().delete(view);
    }
}

// G_PlayerReborn's bodyque, BODYQUESIZE.
DoomPlayerBodies.CORPSE_QUEUE = 32;
