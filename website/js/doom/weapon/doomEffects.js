// Transient sprite effects spawned by weapons: the bullet puff (P_SpawnPuff /
// MT_PUFF) and the projectile explosions (rocket / plasma / BFG death frames).
// Each effect is a short sprite animation; its frame billboards are pre-built
// once at level load (in the loader batch), and each spawned effect is a runtime
// instance re-pointed to the current frame, then despawned. Faithful to vanilla:
// PUFF A-D (4 tics each) floats up, its first frame is fullbright and a melee
// hit starts at frame C; the explosion frames come straight from info.c.
class DoomEffects {
    constructor(spriteBank, rng) {
        this._rng       = rng;
        this._active    = [];
        this._acc       = 0;
        this._templates = this._buildTemplates(spriteBank);
    }

    _buildTemplates(bank) {
        // alpha/additive follow gzdoom: the rocket blast is opaque smoke, the
        // plasma/BFG blasts glow (RenderStyle "Add", Alpha 0.75). The puff keeps
        // its light translucency (0.25).
        return {
            puff:          this._buildTemplate(bank, 'PUFF', ['A', 'B', 'C', 'D'],           [4, 4, 4, 4],          0.25, true,  false),
            rocketExplode: this._buildTemplate(bank, 'MISL', ['B', 'C', 'D'],                [8, 6, 4],             1,    false, false),
            plasmaExplode: this._buildTemplate(bank, 'PLSE', ['A', 'B', 'C', 'D', 'E'],      [4, 4, 4, 4, 4],       0.75, false, true),
            bfgExplode:    this._buildTemplate(bank, 'BFE1', ['A', 'B', 'C', 'D', 'E', 'F'], [8, 8, 8, 8, 8, 8],    0.75, false, true),
        };
    }

    // One shared billboard object per frame; null if the WAD lacks the graphics
    // (probed quietly — another game's WAD misses them all, no warning spam).
    _buildTemplate(bank, spriteBase, letters, frameTics, alpha, rise, additive) {
        const scale  = WadConstants.SCALE;
        const frames = [];
        for (const letter of letters) {
            if (!bank.has(spriteBase + letter + '0')) {
                return null;
            }
            const spr = bank.get(spriteBase + letter + '0');
            frames.push({
                objId:  loader.objects().loadBillboardFromData(null, {
                    textures:      [spr.texId],
                    halfWidth:     (spr.width * scale) / 2,
                    height:        spr.height * scale,
                    anchorOffsetX: ((spr.width / 2) - spr.leftOffset) * scale,
                    anchorOffsetY: 0,
                    light:         255,
                    alpha:         alpha,
                    additive:      additive,
                }),
                height: spr.height * scale,
            });
        }
        return { frames, frameTics, rise };
    }

    // Bullet puff at a world impact point. melee starts at frame C.
    spawnPuff(x, y, z, melee) {
        this.spawn('puff', x, y, z, ((melee) ? 2 : 0));
    }

    // Spawn a named effect animation, centred on the impact point.
    spawn(name, x, y, z, startFrame = 0) {
        const tpl = this._templates[name];
        if ((tpl === null) || (tpl === undefined)) {
            return;
        }
        const frame = tpl.frames[startFrame];
        const jz    = ((tpl.rise) ? (this._rng.next() - this._rng.next()) / 4096 : 0);  // puff z-rand
        const instId = loader.instances().spawnFromData(null, {
            object:         frame.objId,
            position:       [x, y + jz - frame.height / 2, z],
            rotation:       [0, 0, 0],
            trigger:        'none',
            loop:           false,
            onlyOnce:       false,
            collisionShape: 'none',
            keyframes:      [],
        });
        // th->tics -= P_Random()&3: the puff's first frame is a touch shorter.
        const elapsed = ((tpl.rise) ? (this._rng.next() & 3) : 0);
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
            if (p.tpl.rise) {
                inst.getTransform().position[1] += WadConstants.SCALE;   // momz = 1 map unit/tic
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
