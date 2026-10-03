/**
 * Writes a decoded turn state into the level a sub built, on its own, without
 * any previous state: it creates the bodies and shots it lacks, removes those
 * absent, updates the others — the viewed player's body, camera, HUD and
 * weapon, the movers, the pickups, the switches, the rewritten floors, the
 * light levels and the level statistics — then plays the turn's events, their
 * ids turned back into references. The sub simulates nothing: its world is
 * only ever posed.
 */
class DoomReplicaApplier {
    /**
     * @param {DoomPlayerRoster} roster
     * @param {DoomBuiltLevel}   builtLevel
     * @param {DoomLevelStats}   stats
     * @param {function(object)} playEvent - DoomPresentation.playTurnEvent
     */
    constructor(roster, builtLevel, stats, playEvent) {
        this._roster      = roster;
        this._level       = builtLevel;
        this._ids         = builtLevel.getEntityIds();
        this._stats       = stats;
        this._playEvent   = playEvent;
        this._bodies      = new Map();   // id → DoomBodyView
        this._projectiles = new Map();   // id → DoomProjectileView
        this._restPoses   = new Map();   // mover id → {position it was built at, atRest: posed there now}
        this._goneBodies  = new Map();   // id → last position of a body removed this turn
        this._switches    = [];
        this._pickups     = new Map(builtLevel.getPickups().map((pickup) => [pickup.code, pickup]));
        for (const view of builtLevel.getBodyViews()) {
            this._bodies.set(this._ids.idOfView(view), view);
        }
        loader.interactions().getAll().forEach((entity) => {
            const interaction = entity.getInteraction();
            if (interaction instanceof DoomSwitchInteraction) {
                this._switches.push(interaction);
            }
        });
    }

    /**
     * @param {object} snapshot - a decoded StateSnapshot
     */
    apply(snapshot) {
        this._goneBodies.clear();
        for (const state of snapshot.players) {
            this._applyPlayer(state);
        }
        this._applyBodies(snapshot.bodies, snapshot.bornBodies);
        this._applyProjectiles(snapshot.projectiles);
        this._applyPickups(snapshot.pickups);
        this._applyMovers(snapshot.movers);
        this._applySwitches(snapshot.switches);
        if (this._level.getSectorSurfaces() !== null) {
            this._level.getSectorSurfaces().showReplicatedFlats(snapshot.surfaces);
        }
        if (this._level.getLightEffects() !== null) {
            this._level.getLightEffects().setLevels(snapshot.lights);
        }
        this._stats.importCounts(snapshot.stats);
        // Nothing runs World.update here: the removals are flushed by hand.
        loader.instances().flushRemovals();
        for (const event of snapshot.events) {
            const played = this._event(event);
            if (played !== null) {
                this._playEvent(played);
            }
        }
    }

    // --- Players ---

    // A player this device holds (the viewed one in screen sharing).
    _applyPlayer(state) {
        const player = this._playerOf(state.id);
        if (player === null) {
            return;
        }
        player.getUser().applyReplicatedState(state);
        const weapon = state.weapon;
        player.getWeaponView().setWeapon(weapon.weapon)
            .setWeaponFrame(weapon.lump, weapon.bright)
            .setFlashFrame(weapon.flashLump)
            .setOffset(weapon.offsetX, weapon.offsetY)
            .setLowered(weapon.lowered)
            .setExtraLight(weapon.extraLight);
    }

    _playerOf(id) {
        return (this._roster.getAll().find((player) => (player.getId() === id)) ?? null);
    }

    // --- Bodies and shots ---

    _applyBodies(states, bornBodies) {
        const born = new Map(bornBodies.map((entry) => [entry.id, entry]));
        const seen = new Set();
        for (const state of states) {
            const view = (this._bodies.get(state.id) ?? this._createBody(state, born.get(state.id)));
            if (view === null) {
                continue;
            }
            seen.add(state.id);
            view.getInstance().setPose([state.x, state.y, state.z], DoomInertInstance.NO_DELTA, DoomInertInstance.NO_DELTA);
            const keys = ((view.getFrames() !== null) ? DoomNetStateCapture.frameKeys(view.getFrames()) : null);
            view.setFrame((((keys !== null) && (state.frame !== null)) ? keys[state.frame] : null), state.bright)
                .setFacing(state.facing)
                .setSector(state.sector)
                .setCrushed(state.crushed)
                .setRenderScale(state.scale);
            if (state.offset !== null) {
                view.setRenderOffset(state.offset[0], state.offset[1], state.offset[2]);
            } else {
                view.clearRenderOffset();
            }
        }
        for (const [id, view] of this._bodies) {
            if (!seen.has(id)) {
                this._goneBodies.set(id, [...view.getInstance().getWorldCenter()]);
            }
        }
        this._removeUnseen(this._bodies, seen, this._level.getBodyViews());
    }

    // A body born in play, from the templates of the common build.
    _createBody(state, born) {
        if (born === undefined) {
            return null;
        }
        const frames = ((born.drop) ? null : this._framesOfKind(born.kind));
        const objId  = ((born.drop) ? this._dropObject(born.kind) : DoomReplicaApplier._firstObject(frames));
        if (objId === null) {
            return null;
        }
        const view = new DoomBodyView(this._spawn(objId, state.x, state.y, state.z), frames, born.kind)
            .setNetId(state.id)
            .setPlayerId(DoomPlayerBody.playerIdOf(born.kind));
        this._bodies.set(state.id, view);
        this._level.getBodyViews().add(view);

        return view;
    }

    _framesOfKind(kind) {
        const playerFrames = this._level.getPlayerBodyFrames(kind);
        if (playerFrames !== null) {
            return playerFrames;
        }
        const spawnable = (this._level.getMonsterSpawnables()[kind] ?? null);
        if (spawnable !== null) {
            return spawnable.frames;
        }
        const placement = this._level.getMonsterPlacements().find((candidate) => (candidate.def.getCode() === kind));

        return ((placement !== undefined) ? placement.frames : null);
    }

    static _firstObject(frames) {
        return ((frames !== null) ? frames[DoomNetStateCapture.frameKeys(frames)[0]][0] : null);
    }

    _dropObject(key) {
        const template = this._level.getDropTemplates().find((candidate) => (candidate.key === key));

        return ((template !== undefined) ? template.objId : null);
    }

    _applyProjectiles(states) {
        const seen = new Set();
        for (const state of states) {
            const view = (this._projectiles.get(state.id) ?? this._createProjectile(state));
            if (view === null) {
                continue;
            }
            seen.add(state.id);
            view.setFrame(state.frame).setCenter(state.x, state.y, state.z);
        }
        this._removeUnseen(this._projectiles, seen, this._level.getProjectileViews());
    }

    _createProjectile(state) {
        const def = (this._level.getProjectileDefs()[state.kind] ?? null);
        if (def === null) {
            return null;
        }
        const view = new DoomProjectileView(this._spawn(def.frames[0].objId, state.x, state.y, state.z), def.frames, state.kind).setNetId(state.id);
        this._projectiles.set(state.id, view);
        this._level.getProjectileViews().add(view);

        return view;
    }

    _removeUnseen(views, seen, levelViews) {
        for (const [id, view] of views) {
            if (seen.has(id)) {
                continue;
            }
            loader.instances().scheduleRemoval(view.getInstance());
            levelViews.delete(view);
            views.delete(id);
        }
    }

    _spawn(objId, x, y, z) {
        return loader.instances().get(DoomInertInstance.spawn(objId, [x, y, z]));
    }

    // --- Level state ---

    // A pickup back in the state (the items respawn) comes back here too.
    _applyPickups(present) {
        this._ids.getPickupCodes().forEach((code, i) => {
            const here = (loader.instances().idByCode(code) !== null);
            if (!present[i] && here) {
                loader.instances().scheduleRemoval(loader.instances().getByCode(code));
            }
            if (present[i] && !here) {
                DoomPickupSpawner.respawn(this._pickups.get(code));
            }
        });
    }

    // A mover absent from the state is back at the pose it was built at, posed
    // there once.
    _applyMovers(movers) {
        const seen = new Set();
        for (const mover of movers) {
            const instance = this._ids.instanceOf(mover.id);
            if (instance === null) {
                continue;
            }
            if (!this._restPoses.has(mover.id)) {
                this._restPoses.set(mover.id, {position: [...instance.getTransform().position], atRest: false});
            }
            this._restPoses.get(mover.id).atRest = false;
            seen.add(mover.id);
            instance.setPose(mover.position, mover.translate, mover.rotate);
        }
        for (const [id, rest] of this._restPoses) {
            if (seen.has(id) || rest.atRest) {
                continue;
            }
            const instance = this._ids.instanceOf(id);
            if (instance !== null) {
                instance.setPose(rest.position, DoomInertInstance.NO_DELTA, DoomInertInstance.NO_DELTA);
            }
            rest.atRest = true;
        }
    }

    _applySwitches(on) {
        const ids = new Set(on);
        for (const interaction of this._switches) {
            interaction.showReplicatedState(ids.has(this._ids.idOfCode(interaction.code)));
        }
    }

    // --- Events ---

    /**
     * @returns {object|null} the DoomTurnEvents event to play, null when it names
     *                        something this device does not hold
     */
    _event(event) {
        const player = ((event.player !== undefined) ? this._playerOf(event.player) : null);
        switch (event.type) {
            case DoomTurnEvents.SOUND_AT:
                return {type: event.type, name: event.name, point: event.point, options: DoomReplicaApplier._soundOptions(event)};
            case DoomTurnEvents.SOUND_FROM_BODY:
                return this._bodySound(event);
            case DoomTurnEvents.SOUND_FROM_PLAYER:
                return this._playerSound(event, player);
            case DoomTurnEvents.SOUND_TO_PLAYER:
            case DoomTurnEvents.PLAYER_TELEPORTED:
                return ((player !== null) ? {type: event.type, name: event.name, user: player.getUser()} : null);
            case DoomTurnEvents.EFFECT:
                return this._effect(event);
            case DoomTurnEvents.DECAL:
                return Object.assign({}, event, {owner: ((event.owner !== null) ? this._ids.instanceOf(event.owner) : null)});
        }

        return null;
    }

    // A player this device holds speaks centred; any other from where it stood this
    // turn, on that player's channel.
    _playerSound(event, player) {
        if (player !== null) {
            return {type: event.type, name: event.name, user: player.getUser(), channel: event.channel};
        }

        return {type: DoomTurnEvents.SOUND_AT, name: event.name, point: event.point, options: {replaceKey: DoomSoundSystem.playerChannelKey(event.player, event.channel)}};
    }

    // A body gone in the same turn rings from where it was last.
    _bodySound(event) {
        const body = (this._bodies.get(event.body) ?? null);
        if (body !== null) {
            return {type: event.type, name: event.name, body: body, options: DoomReplicaApplier._soundOptions(event)};
        }
        const point = (this._goneBodies.get(event.body) ?? null);

        return ((point !== null) ? {type: DoomTurnEvents.SOUND_AT, name: event.name, point: point, options: DoomReplicaApplier._soundOptions(event)} : null);
    }

    _effect(event) {
        if (event.follow === null) {
            return event;
        }
        const target = ((event.follow.body !== null)
            ? (this._bodies.get(event.follow.body) ?? null)
            : (this._playerOf(event.follow.player)?.getUser() ?? null));

        return Object.assign({}, event, {follow: ((target !== null) ? {target: target, ahead: event.follow.ahead} : null)});
    }

    static _soundOptions(event) {
        return {attenuation: event.attenuation, replaceKey: event.replaceKey};
    }
}

