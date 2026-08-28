/**
 * Capture and restore of a running level as pure JSON-safe data. The level
 * itself is never serialized: loading replays the deterministic level build
 * (same WAD + level + skill → same instance codes), then this service patches
 * the dynamic state on top — player, movers, pickups, interactions, gun
 * triggers, monsters and the RNG index.
 *
 * Assumed exclusions (transient or cosmetic, like most of what vanilla also
 * skips): sprite effects, decals, sector light phases, sector sound targets,
 * the fine psprite state (the active weapon replays its raise) and the
 * monsters' render smoothing.
 *
 * The context is assembled by DoomGame (_snapshotContext): explicit
 * dependencies, no reach into its private fields.
 */
class DoomGameSnapshot {
    /**
     * @param {object} context - {wadId, levelCode, skill, user, rng, monsters,
     *                            projectiles, gunTriggers, secretsFound,
     *                            killsCount, itemsFound, levelTimeMs,
     *                            setCounters}
     * @returns {object} JSON-safe snapshot
     */
    capture(context) {
        const user = context.user;

        return {
            formatVersion: DoomSaveStore.FORMAT_VERSION,
            wadId:         context.wadId,
            levelCode:     context.levelCode,
            skill:         context.skill,
            savedAt:       Date.now(),
            player: {
                state: user.exportState(),
                x:     user.x,
                y:     user.y,
                z:     user.z,
                yaw:   user.yaw,
                pitch: user.pitch,
            },
            stats: {
                secretsFound: context.secretsFound,
                killsCount:   context.killsCount,
                itemsFound:   context.itemsFound,
                levelTimeMs:  context.levelTimeMs,
            },
            rng:          context.rng.getIndex(),
            instances:    this._captureInstances(),
            interactions: this._captureInteractions(),
            gunTriggers:  ((context.gunTriggers !== null) ? context.gunTriggers.exportState() : null),
            automap:      ((context.automap !== null) ? context.automap.exportState() : null),
            monsters:     context.monsters.exportState(),
            projectiles:  context.projectiles.exportState(),
        };
    }

    // Applies a snapshot on the freshly rebuilt level — called once everything
    // is built and wired, before the first frame runs. The player equipment is
    // restored earlier by DoomGame (it replaces the loadout branch of _init).
    apply(context, snapshot) {
        // itemsFound and levelTimeMs postdate FORMAT_VERSION 2: absent from the
        // saves written before them, and the version is compared strictly
        // (bumping it would throw every existing save away).
        context.setCounters(snapshot.stats.secretsFound, snapshot.stats.killsCount,
            (snapshot.stats.itemsFound ?? 0), (snapshot.stats.levelTimeMs ?? 0));
        this._applyInstances(snapshot.instances, context.collision);
        this._applyInteractions(snapshot.interactions);
        if ((context.gunTriggers !== null) && (snapshot.gunTriggers !== null)) {
            context.gunTriggers.importState(snapshot.gunTriggers);
        }
        // A save with no map state restarts blank, like the counters above.
        if (context.automap !== null) {
            context.automap.importState(snapshot.automap ?? null);
        }
        context.monsters.importState(snapshot.monsters);
        // Missiles last: an owner or a homing lock is resolved against the
        // bodies the line above just brought back. Absent from the saves
        // written before they were persisted.
        context.projectiles.importState(snapshot.projectiles ?? null);
        loader.instances().flushRemovals();

        // The player position is re-applied AFTER the movers: the spawn
        // override snapped him onto the STATIC floor, while the saved spot may
        // sit on a mover restored mid-travel (a lift half-way up).
        const user = context.user;
        user.x = snapshot.player.x;
        user.y = snapshot.player.y;
        user.z = snapshot.player.z;
        user.syncPositionTracking();

        context.rng.setIndex(snapshot.rng);
    }

    // Every coded instance except the monsters' bodies (owned by the monster
    // system, restored through its own records). forEach skips the holes a
    // consumed pickup leaves in the loader's entity array.
    _captureInstances() {
        const states = {};
        loader.instances().getAll().forEach((instance) => {
            const code = instance.getCode();
            if ((code === null) || code.startsWith(DoomGameSnapshot.MONSTER_PREFIX)) {
                return;
            }
            states[code] = instance.exportAnimState();
        });

        return states;
    }

    // Rebuilt instances are patched by code; one absent from the snapshot was
    // consumed before the save when it is a pickup (removed again here), and
    // is ignored otherwise. A snapshot code unknown to the rebuild is simply
    // never visited; a deeper mismatch (edited WAD breaking a ride or drop
    // code) surfaces through the launch error modal.
    _applyInstances(states, collision) {
        loader.instances().getAll().forEach((instance) => {
            const code = instance.getCode();
            if ((code === null) || code.startsWith(DoomGameSnapshot.MONSTER_PREFIX)) {
                return;
            }
            const data = states[code];
            if (data === undefined) {
                if (code.startsWith(DoomGameSnapshot.PICKUP_PREFIX)) {
                    loader.instances().scheduleRemoval(instance);
                }
                return;
            }
            const rideOn = ((data.rideOnCode !== null) ? loader.instances().getByCode(data.rideOnCode) : null);
            instance.importAnimState(data, rideOn);
            if (instance.isCollidable()) {
                collision.syncBoxFor(instance);
            }
        });
    }

    _captureInteractions() {
        const states = {};
        loader.interactions().getAll().forEach((entity) => {
            const state = entity.getInteraction().exportState();
            if (state !== null) {
                states[entity.getCode()] = state;
            }
        });

        return states;
    }

    _applyInteractions(states) {
        loader.interactions().getAll().forEach((entity) => {
            const state = states[entity.getCode()];
            if (state !== undefined) {
                entity.getInteraction().importState(state);
            }
        });
    }
}

// Instance code prefixes of the world builder (_registerThings / _registerMonsterThing)
DoomGameSnapshot.MONSTER_PREFIX = 'monster_';
DoomGameSnapshot.PICKUP_PREFIX  = 'pickup_';
// Extra height given to the initial spawn override: a Y exactly at floor level
// misses the floor snap (the saved Y is the search ceiling). The exact saved Y
// is re-applied by apply() once the movers are restored.
DoomGameSnapshot.SPAWN_Y_MARGIN = 0.1;
