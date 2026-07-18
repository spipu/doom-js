// Transient sprite effects spawned by weapons — currently the bullet puff
// (P_SpawnPuff / MT_PUFF). Faithful to vanilla: 4 frames (PUFF A-D, 4 tics
// each), the puff floats up at 1 map unit/tic, the first frame is fullbright,
// a melee hit starts at frame C (no bright spark on the wall), and the spawn z
// is randomised a little. One shared billboard object per frame is built at
// level load (in the loader batch); each puff is a runtime instance re-pointed
// to the current frame's billboard, then despawned.
class DoomEffects {
    constructor(spriteBank, rng) {
        this._rng    = rng;
        this._active = [];
        this._acc    = 0;
        this._puff   = this._buildPuffFrames(spriteBank);
    }

    _buildPuffFrames(bank) {
        const scale  = WadConstants.SCALE;
        const frames = [];
        for (const letter of ['A', 'B', 'C', 'D']) {
            const spr = bank.get('PUFF' + letter + '0');
            if (spr === null) {
                return null;   // no PUFF graphics in this WAD → no puffs
            }
            frames.push({
                objId:  loader.objects().loadBillboardFromData(null, {
                    textures:      [spr.texId],
                    halfWidth:     (spr.width * scale) / 2,
                    height:        spr.height * scale,
                    anchorOffsetX: ((spr.width / 2) - spr.leftOffset) * scale,
                    anchorOffsetY: 0,
                    light:         255,
                    alpha:         0.25,
                }),
                height: spr.height * scale,
            });
        }
        return frames;
    }

    // Spawn a bullet puff at a world impact point. melee starts at frame C.
    spawnPuff(x, y, z, melee) {
        if (this._puff === null) {
            return;
        }
        const start = ((melee) ? 2 : 0);
        const jz    = (this._rng.next() - this._rng.next()) / 4096;   // vanilla (rnd-rnd)<<10, in world units
        const frame = this._puff[start];
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
        // th->tics -= P_Random()&3: the first frame is a touch shorter.
        this._active.push({ instId, frame: start, shown: start, tics: (this._rng.next() & 3) });
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
            p.tics += 1;
            const frame = p.frame + Math.floor(p.tics / DoomEffects.FRAME_TICS);
            if (frame > 3) {
                loader.instances().scheduleRemoval(inst);
                continue;
            }
            if (frame !== p.shown) {
                inst.setObject(this._puff[frame].objId);
                p.shown = frame;
            }
            inst.getTransform().position[1] += WadConstants.SCALE;   // momz = 1 map unit/tic
            kept.push(p);
        }
        this._active = kept;
    }
}

DoomEffects.FRAME_TICS = 4;
DoomEffects.MS_PER_TIC = 1000 / 35;
