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
    // Every frame is re-blitted on the template's COMMON canvas, at the place
    // its own vanilla offsets dictate (R_ProjectSprite draws a sprite with its
    // left edge at -leftoffset and its top at +topoffset around the mobj
    // point): all frames then share one quad geometry anchored on that point,
    // so the runtime frame swap (setObject) never shifts the animation.
    // Without this, frames of different heights stayed glued to the first
    // frame's foot line — explosions on walls looked bottom-aligned.
    _buildTemplate(bank, spec) {
        const sprites = [];
        for (const letter of spec.letters) {
            if (!bank.has(spec.sprite + letter + '0')) {
                return null;
            }
            sprites.push(bank.get(spec.sprite + letter + '0'));
        }

        const scale  = WadConstants.SCALE;
        const box    = this._commonBox(sprites);
        const frames = [];
        for (const spr of sprites) {
            frames.push({
                objId: loader.objects().loadBillboardFromData(null, {
                    textures:      [this._padToBox(spr, box)],
                    halfWidth:     (box.width * scale) / 2,
                    height:        box.height * scale,
                    anchorOffsetX: ((box.width / 2) + box.left) * scale,
                    anchorOffsetY: box.bottom * scale,
                    light:         255,
                    alpha:         spec.alpha,
                    additive:      spec.additive,
                }),
            });
        }
        return { frames, frameTics: spec.frameTics, rise: spec.rise, meleeStart: spec.meleeStart ?? 0 };
    }

    // Bounding box of every frame in the vanilla anchor space (x to the right
    // of the mobj point, y up): a frame spans [-leftoffset, width-leftoffset]
    // horizontally and [topoffset-height, topoffset] vertically.
    _commonBox(sprites) {
        let left   = Infinity;
        let right  = -Infinity;
        let top    = -Infinity;
        let bottom = Infinity;
        for (const spr of sprites) {
            left   = Math.min(left, -spr.leftOffset);
            right  = Math.max(right, spr.width - spr.leftOffset);
            top    = Math.max(top, spr.topOffset);
            bottom = Math.min(bottom, spr.topOffset - spr.height);
        }
        return { left, right, top, bottom, width: right - left, height: top - bottom };
    }

    // Re-blit one decoded frame onto the common canvas at its offset-aligned
    // place and register the padded texture (still inside the load batch —
    // the transparent padding is harmless with premultiplied-alpha uploads).
    _padToBox(spr, box) {
        const src   = loader.textures().get(spr.texId);
        const out   = new ImageData(box.width, box.height);
        const destX = -spr.leftOffset - box.left;
        const destY = box.top - spr.topOffset;
        for (let sy = 0; sy < spr.height; sy++) {
            const srcOfs  = sy * spr.width * 4;
            const destOfs = ((destY + sy) * box.width + destX) * 4;
            out.data.set(src.data.subarray(srcOfs, srcOfs + spr.width * 4), destOfs);
        }
        return loader.textures().loadFromData(null, out);
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
    // point: every frame's quad is anchored there through the template's
    // common canvas (vanilla offsets), no per-frame height correction needed.
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
        const elapsed = ((tpl.rise > 0) ? (this._rng.next() & 3) : 0);
        this._active.push({ tpl, instId, start: startFrame, shown: startFrame, elapsed });
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
                inst.getTransform().position[1] += p.tpl.rise * WadConstants.SCALE;   // momz, map units/tic
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
