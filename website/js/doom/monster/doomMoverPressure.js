/**
 * Mover pressure on the bodies — vanilla P_ChangeSector / PIT_ChangeSector,
 * run on the sector graph like the sound flood: a body of a closing sector
 * that no longer fits makes the mover react through the SAME per-cycle
 * behaviour table as the player —
 *  - 'crush': CRUSH_DAMAGE every CRUSH_DAMAGE_WINDOW_TICS, sourceless (no
 *    retarget), head clamped under the descending panel. While a live body
 *    is crushed the mover is flagged pressing and holds the flag until its
 *    direction flips (UZDoom crushSlowdown: m_Speed = 1/8 for the rest of
 *    the descent, linuxdoom CEILSPEED/8) — the cycle's own blockedSlowFactor
 *    decides the actual throttle, so only the specials vanilla slows are
 *    slowed. The player pass clears the flag every frame the player is not
 *    pinched, so refreshMotion re-asserts it per frame;
 *  - 'reverse': the mover heads back (a closing door reopens, a rising plat
 *    goes back down) — ONE reversal per closing episode (vanilla decides once
 *    per move, not per thing: two pinched bodies must not flip the door
 *    back and forth). When the reverse playback itself re-closes the gap
 *    (the opening segment replayed backward), the memo has been cleared by
 *    the reopening in between, and reverseBlocked's flip-forward reopens in
 *    full — the vanilla door bounce on a blocked closing;
 *  - 'stall' ("DO NOT GO BACK UP!"): the mover pauses against the body and
 *    resumes the instant nothing live is pinched anymore. The stall memo is
 *    ours alone: a stop-line pause (54/89, 57/74) must never be auto-resumed
 *    here.
 * A corpse never blocks: pinched below a quarter of its height (vanilla
 * P_KillMobj height >>= 2), it is ground into the gibs pool instead.
 * Deviation, documented: containment by the body's centre (m.si) where
 * vanilla tests the box.
 */
class DoomMoverPressure {
    // Below this per-frame dy delta a mover counts as not moving.
    static MOTION_EPSILON = 1e-9;

    constructor() {
        this._movers      = [];
        this._crushedView = null;
        this._heights     = null;
        this._damage      = null;
        this._collision   = null;
    }

    setHeights(heights) {
        this._heights = heights;
        return this;
    }

    setDamageModule(damageModule) {
        this._damage = damageModule;
        return this;
    }

    setCollision(collision) {
        this._collision = collision;
        return this;
    }

    // Flattened-corpse billboard prepared in the batch (the vanilla S_GIBS
    // pool a crushed corpse turns into); null = the game has none (Heretic)
    // and a crushed corpse keeps its sprite.
    setCrushedView(objId) {
        this._crushedView = objId;
        return this;
    }

    // One watch per mover of the level: the instance resolves lazily, the
    // per-frame motion fields are filled by refreshMotion.
    setMovers(moverCodes) {
        this._movers = Object.keys(moverCodes).map((key) => ({
            si:      Number(key),
            kind:    moverCodes[key].kind,
            code:    moverCodes[key].code,
            inst:     null,
            lastDy:   null,
            closing:  false,
            reacted:  false,
            pressing: false,
            stalled:  false
        }));
        return this;
    }

    // Per-frame motion of every mover: dy delta since the previous frame, and
    // whether the sector's gap is CLOSING (door/ceiling coming down, floor
    // going up — the only directions that can pinch a body).
    refreshMotion() {
        for (const mv of this._movers) {
            const inst = this._moverInstance(mv);
            const dy   = inst.getTransform().deltaTranslate[1];
            if (mv.lastDy === null) {
                mv.lastDy = dy;
                continue;
            }
            const delta = dy - mv.lastDy;
            mv.closing  = ((mv.kind === 'door')
                ? (delta < -DoomMoverPressure.MOTION_EPSILON)
                : (delta > DoomMoverPressure.MOTION_EPSILON));
            if (mv.closing) {
                if (mv.pressing) {
                    inst.setBlockedPressing(true);
                }
            } else {
                mv.reacted = false;
                if (mv.pressing) {
                    inst.setBlockedPressing(false);
                    mv.pressing = false;
                }
            }
            mv.lastDy = dy;
        }
    }

    // The per-tic pass (see the class doc for the behaviour table).
    pressureTic(monsters, ticCount) {
        if ((this._heights === null) || (this._movers.length === 0)) {
            return;
        }
        for (const mv of this._movers) {
            if (mv.stalled) {
                this._maybeResumeStalled(mv, monsters);
                continue;
            }
            if (!mv.closing) {
                continue;
            }
            const inst     = this._moverInstance(mv);
            const heights  = this._heights.effectiveHeights(mv.si);
            const gap      = heights.ch - heights.fh;
            const behavior = inst.getBlockedBehavior();
            let pinched = false;
            for (const m of monsters) {
                if (m.dead && (m.si === mv.si) && !m.crushedFlat
                    && (gap < (m.def.getHeight() / WadConstants.CORPSE_HEIGHT_DIVISOR))) {
                    this._grindCorpse(m);
                    continue;
                }
                if (!this._pinchedLive(m, mv, gap)) {
                    continue;
                }
                pinched = true;
                if (behavior !== 'crush') {
                    continue;
                }
                this._clampUnderCeiling(m, heights);
                if (((ticCount % WadConstants.CRUSH_DAMAGE_WINDOW_TICS) === 0) && (this._damage !== null)) {
                    this._damage.damage(m, WadConstants.CRUSH_DAMAGE, {noRetarget: true});
                }
            }
            if (behavior === 'crush') {
                if (pinched && !mv.pressing) {
                    inst.setBlockedPressing(true);
                    mv.pressing = true;
                }
                continue;
            }
            if (!pinched) {
                continue;
            }
            if (behavior === 'reverse') {
                if (!mv.reacted) {
                    inst.reverseBlocked();
                    mv.reacted = true;
                }
            } else {
                inst.pause();
                mv.stalled = true;
            }
        }
    }

    // Movers our pass paused against a body: without this a restored mover
    // would stay frozen forever (the anim snapshot only says "paused
    // mid-cycle", which is also what a stop line leaves).
    exportStalled() {
        return this._movers.filter((mv) => mv.stalled).map((mv) => mv.si);
    }

    importStalled(sis) {
        const stalled = new Set(sis);
        for (const mv of this._movers) {
            mv.stalled  = stalled.has(mv.si);
            mv.lastDy   = null;
            mv.reacted  = false;
            mv.pressing = false;
        }
    }

    // Re-apply a saved flat state on a restored record (the view swap is
    // ours, the record loader knows nothing about it).
    restoreFlat(m, wasFlat) {
        m.crushedFlat = ((wasFlat === true) && (this._crushedView !== null));
        if (m.crushedFlat) {
            m.inst.setObject(this._crushedView);
        }
    }

    _pinchedLive(m, mv, gap) {
        return ((m.si === mv.si) && !m.dead && !m.crushedFlat && (gap < m.def.getHeight()));
    }

    _moverInstance(mv) {
        if (mv.inst === null) {
            mv.inst = loader.instances().getByCode(mv.code);
        }
        return mv.inst;
    }

    // A mover we stalled resumes as soon as no LIVE body is pinched anymore
    // (killed or walked out); start() picks the cycle back up exactly where
    // it froze.
    _maybeResumeStalled(mv, monsters) {
        const heights = this._heights.effectiveHeights(mv.si);
        const gap     = heights.ch - heights.fh;
        for (const m of monsters) {
            if (this._pinchedLive(m, mv, gap)) {
                return;
            }
        }
        mv.stalled = false;
        this._moverInstance(mv).start();
    }

    // Vanilla Grind: a bleeding, gibbable corpse becomes the gibs pool
    // (GenericCrush POL5) and stops existing for every later pass.
    _grindCorpse(m) {
        if ((this._crushedView === null)
            || (m.def.getFlags().dontGib === true) || (m.def.getFlags().noBlood === true)) {
            return;
        }
        m.crushedFlat = true;
        m.inst.setObject(this._crushedView);
        if (this._collision !== null) {
            this._collision.removeBoxFor(m.inst);
        }
    }

    // The player's head clamp, for a body: the crusher moves through it while
    // the damage does its work, but the head stays under the panel — never
    // below the sector floor.
    _clampUnderCeiling(m, heights) {
        const S    = WadConstants.SCALE;
        const pos  = m.inst.getTransform().position;
        const topY = Math.max(heights.fh * S, heights.ch * S - m.def.getHeight() * S);
        if (pos[1] > topY) {
            m.inst.translate(0, topY - pos[1], 0);
            if (this._collision !== null) {
                this._collision.syncBoxFor(m.inst);
            }
        }
    }
}
