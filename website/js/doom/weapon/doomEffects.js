/**
 * Transient sprite effects on screen: hitscan puffs, projectile
 * explosions/impacts, blood, teleport fog. Each effect is a short sprite
 * animation over the frame billboards of its template, played from the turn
 * event the simulation emitted with the values it drew: a runtime instance
 * re-pointed to the current frame, then despawned. Draws no random number, so
 * every device plays the same effect.
 */
class DoomEffects {
    /**
     * @param {DoomEffectTemplates} templates
     */
    constructor(templates) {
        this._templates  = templates;
        this._active     = [];
        this._untickedMs = 0;
        this._collision  = null;
    }

    /**
     * The world a ballistic effect lands on. Only the templates declaring
     * landing frames ever query it; without it they simply never land and run
     * their animation out.
     *
     * @param {Collision} collision
     */
    setWorld(collision) {
        this._collision = collision;

        return this;
    }

    /**
     * Every frame's quad is anchored on the event's point, lifted by the
     * template's spawnHeight, through its own vanilla offsets: no per-frame
     * height correction needed.
     *
     * @param {object} event a DoomTurnEvents effect
     */
    spawn(event) {
        const tpl        = this._templates.get(event.name);
        const facing     = ((event.mirror && (tpl.mirrored !== null)) ? tpl.mirrored : tpl);
        const startFrame = event.startFrame;
        const instId     = DoomInertInstance.spawn(facing.frames[startFrame].objId, [event.x, event.y + tpl.spawnHeight + event.jitterY, event.z]);
        // A template with gravity ballistically drops its drift (blood: up at
        // rise, then falling); without it the drift stays constant (puffs).
        // The timeline is carried by the effect, not read off the template:
        // a landing swaps it for the template's own landing frames.
        const vel = event.velocity;
        this._active.push({
            tpl,
            facing,
            instId,
            frames:    facing.frames,
            frameTics: tpl.frameTics,
            start:     startFrame,
            shown:     startFrame,
            elapsed:   event.elapsed,
            vx:        ((vel !== null) ? vel[0] : 0),
            vy:        ((vel !== null) ? vel[1] : tpl.rise),
            vz:        ((vel !== null) ? vel[2] : 0),
            // Held apart from the velocities: gravity walks them through zero
            // at the apex, where testing them would freeze the effect in place.
            drifts:    ((vel !== null) || (tpl.rise > 0)),
            landed:    false,
            follow:    event.follow
        });
        if (event.roll !== 0) {
            loader.instances().get(instId).setRenderRoll(event.roll);
        }
        if (tpl.spawnSound !== null) {
            for (const soundName of tpl.spawnSound) {
                doomSound.playAt(soundName, [event.x, event.y + tpl.spawnHeight, event.z]);
            }
        }
    }

    update(dtMs) {
        if (this._active.length === 0) {
            return;
        }
        this._untickedMs += dtMs;
        while (this._untickedMs >= WadConstants.MS_PER_TIC) {
            this._untickedMs -= WadConstants.MS_PER_TIC;
            this._stepTic();
        }
    }

    _stepTic() {
        const kept = [];
        for (const effect of this._active) {
            const inst = loader.instances().get(effect.instId);
            if (inst === undefined) {
                continue;
            }
            effect.elapsed += 1;
            const frame = this._frameAt(effect);
            if (frame >= effect.frames.length) {
                loader.instances().scheduleRemoval(inst);
                continue;
            }
            if (frame !== effect.shown) {
                inst.setObject(effect.frames[frame].objId);
                effect.shown = frame;
            }
            this._drift(effect, inst);
            if (effect.follow !== null) {
                const at  = DoomEffects._followedPoint(effect.follow);
                const pos = inst.getTransform().position;
                pos[0] = at[0];
                pos[1] = at[1] + effect.tpl.spawnHeight;
                pos[2] = at[2];
            }
            kept.push(effect);
        }
        this._active = kept;
    }

    // Per-tic displacement (momz, map units/tic) of a drifting effect: the
    // upward rise every template may carry, and the sideways throw a spawn may
    // have been given. A landed one holds still on its final frames.
    _drift(effect, inst) {
        if (effect.landed || !effect.drifts) {
            return;
        }
        const scale = WadConstants.SCALE;
        const fromY = inst.getTransform().position[1];
        inst.translate(effect.vx * scale, effect.vy * scale, effect.vz * scale);
        if (effect.tpl.gravity > 0) {
            effect.vy -= effect.tpl.gravity;
        }
        if ((effect.tpl.landing !== null) && (this._collision !== null)) {
            this._land(effect, inst, fromY);
        }
    }

    // Tested AFTER the move so a chunk thrown out of its surface does not land
    // at birth; the floor search is capped at the height it comes FROM, or a
    // tic overshooting the floor would let it fall through.
    _land(effect, inst, fromY) {
        const pos    = inst.getTransform().position;
        const floorY = this._collision.getFloor(pos[0], pos[2], 0, Math.max(fromY, pos[1]));
        if ((floorY === -Infinity) || (pos[1] > floorY)) {
            return;
        }
        inst.translate(0, floorY - pos[1], 0);
        effect.landed    = true;
        effect.frames    = effect.facing.landing.frames;
        effect.frameTics = effect.facing.landing.frameTics;
        effect.start     = 0;
        effect.elapsed   = 0;
        effect.shown     = 0;
        inst.setObject(effect.frames[0].objId);
    }

    // Where a riding effect stands this tic: in front of the player, or of the
    // body whose view it follows.
    static _followedPoint(follow) {
        const target = follow.target;
        if (!(target instanceof DoomBodyView)) {
            return DoomActorRef.aheadOf(target, follow.ahead);
        }
        const pos = target.getInstance().getTransform().position;

        return DoomActorRef.pointFrom(pos[0], pos[1], pos[2], target.getFacing(), follow.ahead);
    }

    // Returns the frame count once the timeline is finished.
    _frameAt(effect) {
        let acc = 0;
        for (let i = effect.start; i < effect.frames.length; i++) {
            acc += effect.frameTics[i];
            if (effect.elapsed < acc) {
                return i;
            }
        }
        return effect.frames.length;
    }
}
