/**
 * Persistent impact decals on screen (UZDoom / GZDoom feature; vanilla Doom
 * has none), placed from the turn events the simulation emitted: a mark that
 * stays, with a FIFO cap on permanent decals, and the BFG lightning fading
 * away (animator GoAway2) over a permanent lower scorch.
 *
 * A decal is a flat textured quad glued to the surface — a normal Object3d (NOT
 * a camera-facing Billboard): its orientation is baked into the instance
 * rotation. Each placement only spawns an Instance (spawnFromData, no loader
 * re-check) on a template built in the load batch.
 */
class DoomDecals {
    /**
     * @param {DoomDecalTemplates} templates
     */
    constructor(templates) {
        this._templates = templates;
        this._permanent = [];   // instIds, FIFO capped at MAX
        this._fading    = [];   // {instId, steps, elapsed, shown} — BFG lightning
    }

    /**
     * @param {object} event a DoomTurnEvents decal
     */
    place(event) {
        const variant = this._templates.variantsOf(event.key)[event.variant];
        const objId   = ((event.fade) ? variant.steps[0] : variant);
        const instId  = loader.instances().spawnFromData(null, {
            object:         objId,
            position:       event.position,
            rotation:       event.rotation,
            trigger:        'none',
            loop:           false,
            onlyOnce:       false,
            collisionShape: 'none',
            keyframes:      [],
        });
        if (event.owner !== null) {
            loader.instances().get(instId).setRideOn(event.owner);
        }
        if (event.fade) {
            this._fading.push({ instId, steps: variant.steps, elapsed: 0, shown: 0 });
            return;
        }
        this._permanent.push(instId);
        if (this._permanent.length > DoomDecals.MAX) {
            const oldInst = loader.instances().get(this._permanent.shift());
            if (oldInst !== undefined) {
                loader.instances().scheduleRemoval(oldInst);
            }
        }
    }

    // Advance the BFG lightning fade (GoAway2: hold FADE_START s, fade over
    // FADE_TIME s, then despawn). Permanent decals need no update.
    update(dtMs) {
        if (this._fading.length === 0) {
            return;
        }
        const kept = [];
        for (const fade of this._fading) {
            const inst = loader.instances().get(fade.instId);
            if (inst === undefined) {
                continue;
            }
            fade.elapsed += dtMs;
            const seconds = fade.elapsed / 1000;
            if (seconds < DoomDecals.FADE_START) {
                kept.push(fade);
                continue;
            }
            const progress = (seconds - DoomDecals.FADE_START) / DoomDecals.FADE_TIME;
            if (progress >= 1) {
                loader.instances().scheduleRemoval(inst);
                continue;
            }
            const step = Math.min(fade.steps.length - 1, Math.floor(progress * fade.steps.length));
            if (step !== fade.shown) {
                inst.setObject(fade.steps[step]);
                fade.shown = step;
            }
            kept.push(fade);
        }
        this._fading = kept;
    }
}

DoomDecals.MAX        = 256;   // FIFO cap on permanent decals
DoomDecals.FADE_START = 1.0;   // GoAway2 DecayStart (s)
DoomDecals.FADE_TIME  = 3.0;   // GoAway2 DecayTime (s)
