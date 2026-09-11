/**
 * Transient sprite effects spawned at runtime: hitscan puffs, projectile
 * explosions/impacts, blood, teleport fog. Each effect is a short sprite
 * animation; its frame billboards are pre-built once at level load (in the
 * loader batch), and each spawned effect is a runtime instance re-pointed to
 * the current frame, then despawned. All the data (sprites, tics, alpha,
 * drift) comes from the game profile's effectTemplates() — the Doom puff
 * floats up 1 map unit/tic and starts a melee hit at frame C, the explosion
 * frames come straight from the game sources.
 */
class DoomEffects {
    constructor(spriteBank, rng, profile) {
        this._rng       = rng;
        this._active    = [];
        this._acc       = 0;
        this._collision = null;
        this._templates = this._buildTemplates(spriteBank, profile);
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
     * One more template, built after construction from a bank of its own — the
     * generic splash bakes a set of frames per liquid flat, which only the
     * level knows. Like every other template it must be registered inside the
     * load batch.
     *
     * @param {object} bank has(lump) / get(lump), as a sprite bank answers
     * @param {object} spec an effectTemplates() entry
     */
    addTemplate(bank, spec) {
        this._templates[spec.name] = this._buildTemplate(bank, spec);

        return this;
    }

    _buildTemplates(bank, profile) {
        const templates = {};
        for (const spec of profile.effectTemplates()) {
            templates[spec.name] = this._buildTemplate(bank, spec);
        }
        return templates;
    }

    // One shared billboard object per distinct letter (a fog animation repeats
    // letters); null if the WAD lacks any of the graphics (probed quietly —
    // another game's WAD misses them all, no warning spam).
    // Every frame carries its OWN vanilla anchor (R_ProjectSprite draws a
    // sprite with its left edge at -leftoffset and its top at +topoffset
    // around the mobj point), so frames of different sizes all align on that
    // point and the runtime frame swap (setObject) never shifts the animation.
    _buildTemplate(bank, spec) {
        const landing = (spec.landing ?? null);
        const letters = spec.letters.concat(((landing !== null) ? landing.letters : []));
        for (const letter of letters) {
            if (!bank.has(spec.sprite + letter + '0')) {
                return null;
            }
        }
        // One shared map for both timelines: a chunk replays on landing the
        // very frame its flight ended on, and must not build it twice.
        const byLetter = new Map();
        const frames   = this._buildFrames(bank, spec, spec.letters, byLetter, false);
        // The first-frame tic shortening is a Doom-family quirk (P_SpawnPuff /
        // P_SpawnBlood under GAME_DoomChex): drifting templates get it unless
        // the spec opts out (Heretic blood).
        return {
            frames,
            frameTics:   spec.frameTics,
            // Frames played where a ballistic effect meets the floor (the
            // Death state of a splash chunk); null = it never lands.
            landing:     ((landing !== null)
                ? {frames: this._buildFrames(bank, spec, landing.letters, byLetter), frameTics: landing.frameTics}
                : null),
            // The same timelines mirrored left to right, when the spec asks for
            // them: the caller then draws which way each spawn faces, so a
            // repeated effect stops stamping the identical picture. null = the
            // effect only ever faces one way.
            mirrored:    ((spec.mirror === true) ? this._buildMirrored(bank, spec, landing) : null),
            rise:        spec.rise,
            gravity:     (spec.gravity ?? 0),
            shorten:     (spec.shorten ?? (spec.rise > 0)),
            // Sound(s) started at the effect's birth, positioned on it — the
            // A_StartSound lines of an effect ACTOR's states (the vile fire).
            spawnSound:  ((spec.spawnSound !== undefined) ? [].concat(spec.spawnSound) : null),
            meleeStart:  spec.meleeStart ?? 0,
            // P_SpawnTeleportFog raises the fog by gameinfo telefogheight
            // (Doom 0, Raven 32); stored pre-scaled to world units.
            spawnHeight: (spec.spawnHeight ?? 0) * WadConstants.SCALE
        };
    }

    // The mirrored twin of a template's timelines, with a letter map of its
    // own: the same letter is a different billboard on each side.
    _buildMirrored(bank, spec, landing) {
        const byLetter = new Map();

        return {
            frames:  this._buildFrames(bank, spec, spec.letters, byLetter, true),
            landing: ((landing !== null)
                ? {frames: this._buildFrames(bank, spec, landing.letters, byLetter, true), frameTics: landing.frameTics}
                : null)
        };
    }

    // Billboards of one timeline, sharing byLetter with the others of the
    // same template so a letter used twice costs a single object. Mirroring
    // flips the anchor with the picture: the offset is measured from the left
    // edge, which becomes the right one.
    _buildFrames(bank, spec, letters, byLetter, flipX = false) {
        const scale  = WadConstants.SCALE;
        const frames = [];
        for (const letter of letters) {
            if (!byLetter.has(letter)) {
                const spr = bank.get(spec.sprite + letter + '0');
                const geo = WadGeometry.spriteBillboardData(spr);
                byLetter.set(letter, loader.objects().loadBillboardFromData(null, {
                    textures:      [spr.texId],
                    halfWidth:     geo.halfWidth,
                    height:        geo.height,
                    anchorOffsetX: ((flipX) ? -geo.anchorOffsetX : geo.anchorOffsetX),
                    anchorOffsetY: (spr.topOffset - spr.height) * scale,
                    light:         255,
                    alpha:         spec.alpha,
                    additive:      spec.additive,
                    flipX:         flipX,
                }));
            }
            frames.push({objId: byLetter.get(letter)});
        }

        return frames;
    }

    // Weapon puff at a world impact point; the template is per-weapon def data,
    // a melee hit starts at the template's meleeStart frame.
    spawnPuff(name, x, y, z, melee) {
        const tpl = this._templates[name];
        if ((tpl === null) || (tpl === undefined)) {
            return;
        }
        this.spawn(name, x, y, z, {startFrame: ((melee) ? tpl.meleeStart : 0)});
    }

    // EV_Teleport fog pair: one at the old spot, one TELEPORT_FOG_AHEAD units
    // ahead of the arrival — world-forward of a Doom angle is (cos, sin) — so
    // it is not hidden in the teleported body.
    /**
     * @param {boolean} silent skips the teleport ring — an actor carrying its
     *                  own teleport voice (D'Sparil's zap) keeps the fogs only
     */
    spawnTeleportFogs(fromX, fromY, fromZ, toX, toY, toZ, doomAngle, silent = false) {
        const ahead = WadConstants.TELEPORT_FOG_AHEAD * WadConstants.SCALE;
        const rad   = doomAngle * DEG_TO_RAD;
        this.spawn('teleportFog', fromX, fromY, fromZ);
        this.spawn('teleportFog', toX + Math.cos(rad) * ahead, toY, toZ + Math.sin(rad) * ahead);
        if (silent) {
            return;
        }
        // Departure and arrival each ring (EV_Teleport, both S_StartSound
        // sites of p_telept.c) — players and monsters alike.
        doomSound.playAt('misc/teleport', [fromX, fromY, fromZ]);
        doomSound.playAt('misc/teleport', [toX, toY, toZ]);
    }

    /**
     * Spawn a named effect animation on the given point, lifted by the
     * template's spawnHeight: every frame's quad is anchored there through its
     * own vanilla offsets, no per-frame height correction needed.
     *
     * @param {object} opts {startFrame?: frame to enter the animation on (a
     *                       melee puff starts at C), skipTics?: tics already
     *                       elapsed on that frame, so a row of explosions goes
     *                       off raggedly (A_BrainScream), velocity?: [vx, vy,
     *                       vz] in map units per tic, which replaces the
     *                       template's plain upward drift (a splash chunk is
     *                       thrown out of its ripple), mirror?: draw the
     *                       template's mirrored timelines, ignored by a
     *                       template that declares none, roll?: radians of
     *                       spin in the sprite's own plane}
     * @returns {object|null} the live effect
     */
    spawn(name, x, y, z, opts = {}) {
        const tpl = this._templates[name];
        if ((tpl === null) || (tpl === undefined)) {
            return null;
        }
        // Which way this one faces. The choice is the caller's, never this
        // object's: the splashes draw it from a random stream of their own, so
        // the game's table keeps the vanilla sequence.
        const facing     = (((opts.mirror === true) && (tpl.mirrored !== null)) ? tpl.mirrored : tpl);
        const startFrame = (opts.startFrame ?? 0);
        const jz = ((tpl.rise > 0) ? (this._rng.next() - this._rng.next()) / 4096 : 0);  // puff z-rand
        const instId = loader.instances().spawnFromData(null, {
            object:         facing.frames[startFrame].objId,
            position:       [x, y + tpl.spawnHeight + jz, z],
            rotation:       [0, 0, 0],
            trigger:        'none',
            loop:           false,
            onlyOnce:       false,
            collisionShape: 'none',
            keyframes:      [],
        });
        // th->tics -= P_Random()&3: the puff's first frame is a touch shorter,
        // and a caller may start the animation further in still.
        const elapsed = (((tpl.shorten) ? (this._rng.next() & 3) : 0) + (opts.skipTics ?? 0));
        // A template with gravity ballistically drops its drift (blood: up at
        // rise, then falling); without it the drift stays constant (puffs).
        // The timeline is carried by the effect, not read off the template:
        // a landing swaps it for the template's own landing frames.
        const vel    = (opts.velocity ?? null);
        const active = {
            tpl,
            facing,
            instId,
            frames:    facing.frames,
            frameTics: tpl.frameTics,
            start:     startFrame,
            shown:     startFrame,
            elapsed,
            vx:        ((vel !== null) ? vel[0] : 0),
            vy:        ((vel !== null) ? vel[1] : tpl.rise),
            vz:        ((vel !== null) ? vel[2] : 0),
            // Held apart from the velocities: gravity walks them through zero
            // at the apex, where testing them would freeze the effect in place.
            drifts:    ((vel !== null) || (tpl.rise > 0)),
            landed:    false,
            follow:    null
        };
        if ((opts.roll ?? 0) !== 0) {
            loader.instances().get(instId).setRenderRoll(opts.roll);
        }
        this._active.push(active);
        if (tpl.spawnSound !== null) {
            for (const soundName of tpl.spawnSound) {
                doomSound.playAt(soundName, [x, y + tpl.spawnHeight, z]);
            }
        }

        return active;
    }

    /**
     * An effect that rides a body instead of standing where it was born: the
     * archvile's hellfire, replanted `ahead` map units in front of its victim
     * every tic (A_Fire). It dies of its own animation like any other.
     *
     * @param {string} name
     * @param {object} ref   the body it follows (player or monster)
     * @param {number} ahead map units in front of that body
     */
    spawnTracking(name, ref, ahead) {
        const at     = DoomActorRef.aheadOf(ref, ahead);
        const active = this.spawn(name, at[0], at[1], at[2]);
        if (active === null) {
            return null;
        }
        active.follow = {ref: ref, ahead: ahead};

        return active;
    }

    update(dtMs) {
        if (this._active.length === 0) {
            return;
        }
        this._acc += dtMs;
        while (this._acc >= DoomEffects.MS_PER_TIC) {
            this._acc -= DoomEffects.MS_PER_TIC;
            this._stepTic();
        }
    }

    _stepTic() {
        const kept = [];
        for (const p of this._active) {
            const inst = loader.instances().get(p.instId);
            if (inst === undefined) {
                continue;
            }
            p.elapsed += 1;
            const frame = this._frameAt(p);
            if (frame >= p.frames.length) {
                loader.instances().scheduleRemoval(inst);
                continue;
            }
            if (frame !== p.shown) {
                inst.setObject(p.frames[frame].objId);
                p.shown = frame;
            }
            this._drift(p, inst);
            if (p.follow !== null) {
                const at  = DoomActorRef.aheadOf(p.follow.ref, p.follow.ahead);
                const pos = inst.getTransform().position;
                pos[0] = at[0];
                pos[1] = at[1] + p.tpl.spawnHeight;
                pos[2] = at[2];
            }
            kept.push(p);
        }
        this._active = kept;
    }

    // Per-tic displacement (momz, map units/tic) of a drifting effect: the
    // upward rise every template may carry, and the sideways throw a spawn may
    // have been given. A landed one holds still on its final frames.
    _drift(p, inst) {
        if (p.landed || !p.drifts) {
            return;
        }
        const scale = WadConstants.SCALE;
        const fromY = inst.getTransform().position[1];
        inst.translate(p.vx * scale, p.vy * scale, p.vz * scale);
        if (p.tpl.gravity > 0) {
            p.vy -= p.tpl.gravity;
        }
        if ((p.tpl.landing !== null) && (this._collision !== null)) {
            this._land(p, inst, fromY);
        }
    }

    // Reaching the floor clamps the effect onto it and hands the animation
    // over to the landing timeline, from its first frame. Tested AFTER the
    // move, so a chunk thrown up out of its own surface does not land on the
    // tic it was born; the search is capped at the height it comes FROM, which
    // is the whole interval it just crossed — capped at where it arrives, a
    // tic long enough to overshoot the floor would leave it above the cap and
    // the chunk would fall through.
    _land(p, inst, fromY) {
        const pos    = inst.getTransform().position;
        const floorY = this._collision.getFloor(pos[0], pos[2], 0, Math.max(fromY, pos[1]));
        if ((floorY === -Infinity) || (pos[1] > floorY)) {
            return;
        }
        inst.translate(0, floorY - pos[1], 0);
        p.landed    = true;
        p.frames    = p.facing.landing.frames;
        p.frameTics = p.facing.landing.frameTics;
        p.start     = 0;
        p.elapsed   = 0;
        p.shown     = 0;
        inst.setObject(p.frames[0].objId);
    }

    // Current frame index for an effect that has run `elapsed` tics from `start`
    // of its timeline, walking the per-frame durations; returns the frame count
    // once finished.
    _frameAt(p) {
        let acc = 0;
        for (let i = p.start; i < p.frames.length; i++) {
            acc += p.frameTics[i];
            if (p.elapsed < acc) {
                return i;
            }
        }
        return p.frames.length;
    }
}

DoomEffects.MS_PER_TIC = 1000 / 35;
