// Transient sprite effects spawned by weapons: the hitscan puffs and the
// projectile explosions/impacts. Each effect is a short sprite animation; its
// frame billboards are pre-built once at level load (in the loader batch), and
// each spawned effect is a runtime instance re-pointed to the current frame,
// then despawned. All the data (sprites, tics, alpha, drift) comes from the
// game profile's weaponEffectTemplates() — the Doom puff floats up 1 map
// unit/tic and starts a melee hit at frame C, the explosion frames come
// straight from the game sources.
class DoomEffects {
    constructor(spriteBank, rng, profile) {
        this._rng       = rng;
        this._active    = [];
        this._acc       = 0;
        this._templates = this._buildTemplates(spriteBank, profile);
    }

    _buildTemplates(bank, profile) {
        const templates = {};
        for (const spec of profile.weaponEffectTemplates()) {
            templates[spec.name] = this._buildTemplate(bank, spec);
        }
        return templates;
    }

    // One shared billboard object per frame; null if the WAD lacks the graphics
    // (probed quietly — another game's WAD misses them all, no warning spam).
    // Every frame carries its OWN vanilla anchor (R_ProjectSprite draws a
    // sprite with its left edge at -leftoffset and its top at +topoffset
    // around the mobj point), so frames of different sizes all align on that
    // point and the runtime frame swap (setObject) never shifts the animation
    // — without this, frames stayed glued to the first frame's foot line
    // (bottom-aligned explosions on walls).
    _buildTemplate(bank, spec) {
        const scale  = WadConstants.SCALE;
        const frames = [];
        for (const letter of spec.letters) {
            if (!bank.has(spec.sprite + letter + '0')) {
                return null;
            }
            const spr = bank.get(spec.sprite + letter + '0');
            const geo = WadGeometry.spriteBillboardData(spr);
            frames.push({
                objId: loader.objects().loadBillboardFromData(null, {
                    textures:      [spr.texId],
                    halfWidth:     geo.halfWidth,
                    height:        geo.height,
                    anchorOffsetX: geo.anchorOffsetX,
                    anchorOffsetY: (spr.topOffset - spr.height) * scale,
                    light:         255,
                    alpha:         spec.alpha,
                    additive:      spec.additive,
                }),
            });
        }
        // The first-frame tic shortening is a Doom-family quirk (P_SpawnPuff /
        // P_SpawnBlood under GAME_DoomChex): drifting templates get it unless
        // the spec opts out (Heretic blood).
        return {
            frames,
            frameTics:  spec.frameTics,
            rise:       spec.rise,
            gravity:    (spec.gravity ?? 0),
            shorten:    (spec.shorten ?? (spec.rise > 0)),
            meleeStart: spec.meleeStart ?? 0
        };
    }

    // Weapon puff at a world impact point; the template is per-weapon def data,
    // a melee hit starts at the template's meleeStart frame.
    spawnPuff(name, x, y, z, melee) {
        const tpl = this._templates[name];
        if ((tpl === null) || (tpl === undefined)) {
            return;
        }
        this.spawn(name, x, y, z, ((melee) ? tpl.meleeStart : 0));
    }

    // Spawn a named effect animation. The instance sits exactly on the impact
    // point: every frame's quad is anchored there through its own vanilla
    // offsets, no per-frame height correction needed.
    spawn(name, x, y, z, startFrame = 0) {
        const tpl = this._templates[name];
        if ((tpl === null) || (tpl === undefined)) {
            return;
        }
        const jz = ((tpl.rise > 0) ? (this._rng.next() - this._rng.next()) / 4096 : 0);  // puff z-rand
        const instId = loader.instances().spawnFromData(null, {
            object:         tpl.frames[startFrame].objId,
            position:       [x, y + jz, z],
            rotation:       [0, 0, 0],
            trigger:        'none',
            loop:           false,
            onlyOnce:       false,
            collisionShape: 'none',
            keyframes:      [],
        });
        // th->tics -= P_Random()&3: the puff's first frame is a touch shorter.
        const elapsed = ((tpl.shorten) ? (this._rng.next() & 3) : 0);
        // A template with gravity ballistically drops its drift (blood: up at
        // rise, then falling); without it the drift stays constant (puffs).
        this._active.push({ tpl, instId, start: startFrame, shown: startFrame, elapsed, vy: tpl.rise });
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
            const frame = this._frameAt(p.tpl, p.start, p.elapsed);
            if (frame >= p.tpl.frames.length) {
                loader.instances().scheduleRemoval(inst);
                continue;
            }
            if (frame !== p.shown) {
                inst.setObject(p.tpl.frames[frame].objId);
                p.shown = frame;
            }
            if (p.tpl.rise > 0) {
                inst.getTransform().position[1] += p.vy * WadConstants.SCALE;   // momz, map units/tic
                if (p.tpl.gravity > 0) {
                    p.vy -= p.tpl.gravity;
                }
            }
            kept.push(p);
        }
        this._active = kept;
    }

    // Current frame index for an effect that has run `elapsed` tics from `start`,
    // walking the per-frame durations; returns frames.length once finished.
    _frameAt(tpl, start, elapsed) {
        let acc = 0;
        for (let i = start; i < tpl.frames.length; i++) {
            acc += tpl.frameTics[i];
            if (elapsed < acc) {
                return i;
            }
        }
        return tpl.frames.length;
    }
}

DoomEffects.MS_PER_TIC = 1000 / 35;
