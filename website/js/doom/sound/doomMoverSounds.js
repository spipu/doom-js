/**
 * Movement sounds of the level's movers, driven by the engine's vertical
 * motion-change hook (Instance.setOnMotionChange) — the sequences of
 * sndseq.txt reduced to their audible behaviour:
 *
 *  - doors: a one-shot at each leg start (dr1/dr2 by speed); the game's door
 *    style decides the close leg (Doom starts it on the close lump, Raven on
 *    the open one and rings the close lump on arrival);
 *  - plats: pt1_strt at each departure, pt1_stop at each halt;
 *  - floors: the pt1_mid loop while moving, pt1_stop at the halt;
 *  - ceilings/crushers: the loop alone (CeilingNormal has no stop sound); the
 *    silent 141 crusher only clunks its halts (CeilingSemiSilent).
 *
 * The origin is the mover instance's LIVE world centre (the vanilla sector
 * soundorg, following the panel), so the channel tracks it through the
 * per-frame listener refresh.
 */
class DoomMoverSounds {
    /**
     * @param {object} doorStyle profile doorSoundStyle()
     */
    constructor(doorStyle) {
        this._doorStyle = doorStyle;
        this._loops     = {};
        this._lastDirs  = {};
        this._pending   = [];
    }

    /**
     * Declared at build time (the loader is still batching, entities cannot be
     * read yet), wired by wireAll once the level is up.
     *
     * @param {string} code built mover instance code
     * @param {{kind: string, blaze: boolean, silent: boolean}} spec
     *        kind: 'door' | 'plat' | 'floor' | 'ceiling'
     */
    register(code, spec) {
        this._pending.push({code: code, spec: spec});
        return this;
    }

    // Called by the game once the loader is ready (DoomGame._init).
    wireAll() {
        for (const entry of this._pending) {
            const inst = loader.instances().getByCode(entry.code);
            inst.setOnMotionChange((dir) => {
                this._onMotion(inst, entry.spec, dir);
                this._lastDirs[inst.getId()] = dir;
            });
        }
        this._pending = [];

        return this;
    }

    _onMotion(inst, spec, dir) {
        if (spec.kind === 'door') {
            this._doorMotion(inst, spec, dir);
            return;
        }
        if (spec.kind === 'plat') {
            doomSound.playAt(((dir === 0) ? 'plats/pt1_stop' : 'plats/pt1_strt'),
                inst.getWorldCenter(), {replaceKey: DoomMoverSounds._key(inst)});
            return;
        }
        // Floors and ceilings share the movement loop; only the floors clunk
        // their arrival, and the silent crusher clunks WITHOUT ever humming.
        if (dir !== 0) {
            if (!spec.silent && (this._loops[inst.getId()] === undefined)) {
                const handle = doomSound.playAt('plats/pt1_mid', inst.getWorldCenter(), {loop: true});
                if (handle !== null) {
                    this._loops[inst.getId()] = handle;
                }
            }
            return;
        }
        this._stopLoop(inst);
        if ((spec.kind === 'floor') || spec.silent) {
            doomSound.playAt('plats/pt1_stop', inst.getWorldCenter(), {replaceKey: DoomMoverSounds._key(inst)});
        }
    }

    _doorMotion(inst, spec, dir) {
        const style  = this._doorStyle;
        const prefix = ((spec.blaze) ? 'doors/dr2_' : 'doors/dr1_');
        if (dir === 0) {
            // Raven doors ring their close lump when the panel lands shut
            // (HereticDoorClose stopsound) — a halt after a downward leg.
            if (style.closeArrival && (this._lastDirs[inst.getId()] === -1)) {
                doomSound.playAt(prefix + 'clos', inst.getWorldCenter(), {replaceKey: DoomMoverSounds._key(inst)});
            }
            return;
        }
        const closeLump = ((style.closeStart === 'open') ? 'open' : 'clos');
        doomSound.playAt(prefix + ((dir > 0) ? 'open' : closeLump),
            inst.getWorldCenter(), {replaceKey: DoomMoverSounds._key(inst)});
    }

    _stopLoop(inst) {
        const handle = this._loops[inst.getId()];
        if (handle !== undefined) {
            handle.stop();
            delete this._loops[inst.getId()];
        }
    }

    static _key(inst) {
        return ('mover:' + inst.getId());
    }
}
