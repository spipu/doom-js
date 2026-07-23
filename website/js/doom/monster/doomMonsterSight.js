/**
 * Monster senses (phase C): P_CheckSight line of sight and P_NoiseAlert sound
 * propagation, over the level data handed by the world builder (sector
 * adjacency graph, REJECT table, sector polygons resolver).
 *
 * Sight is a 2-ray approximation of the vanilla slope window (documented
 * deviation, same approach as the phase-B blast LOS): eye at feet + 3/4 of
 * the actor height (the vanilla sightzstart), first ray to the target's
 * centre, fallback ray to its top — walls, floor/ceiling slabs and dynamic
 * colliders block (a closed door panel blocks the view). The REJECT lump,
 * when the WAD carries a valid one, is the vanilla trivial-rejection
 * early-out between the two sectors.
 *
 * Sound floods the sector graph like P_RecursiveSound: through the two-sided
 * openings whose CURRENT vertical gap is positive — the effective heights
 * read the live door/lift offsets, so a closed door blocks sound. A first
 * ML_SOUNDBLOCK line still crosses but dampens (soundblocks 1), a second one
 * stops the flood. Every flooded sector remembers the emitter as its sound
 * target (vanilla sector->soundtarget, the Doom-strict COMPATF_SOUNDTARGET
 * behaviour), consumed by A_Look.
 */
class DoomMonsterSight {
    /**
     * @param {Collision} collision
     * @param {object}    levelData DoomMonsterSystem level data: {sectorGraph,
     *                    reject, numSectors, findSector, sectors, doorFloorH,
     *                    restFh, moverCodes}
     */
    constructor(collision, levelData) {
        this._collision      = collision;
        this._graph          = levelData.sectorGraph;
        this._reject         = levelData.reject;
        this._numSectors     = levelData.numSectors;
        this._sectors        = levelData.sectors;
        this._doorFloorH     = levelData.doorFloorH;
        this._restFh         = levelData.restFh;
        this._moverCodes     = levelData.moverCodes;
        this._moverCache     = {};
        this._soundTarget    = new Array(levelData.numSectors).fill(null);
        this._soundTraversed = new Array(levelData.numSectors).fill(0);
        this._floodStamp     = new Array(levelData.numSectors).fill(0);
        this._stamp          = 0;
    }

    // Sound target heard from a sector (null while nothing fired around).
    getSoundTarget(si) {
        return ((si === null) ? null : this._soundTarget[si]);
    }

    /**
     * P_CheckSight between an eye point and the player. The REJECT early-out
     * needs both sector indexes (either may be null — unknown sector skips it).
     *
     * @returns {boolean} true when at least one ray reaches the player
     */
    checkSight(eyeX, eyeY, eyeZ, fromSi, user, userSi) {
        if ((this._reject !== null) && (fromSi !== null) && (userSi !== null)) {
            const pnum = fromSi * this._numSectors + userSi;
            if ((this._reject[pnum >> 3] & (1 << (pnum & 7))) !== 0) {
                return false;
            }
        }
        const height = user.getCurrentHeight();
        return (this._rayClear(eyeX, eyeY, eyeZ, user.x, user.y + height * 0.5, user.z)
            || this._rayClear(eyeX, eyeY, eyeZ, user.x, user.y + height, user.z));
    }

    /**
     * P_NoiseAlert: flood the sector graph from the emitter's sector, marking
     * the emitter as the sound target of every reached sector.
     *
     * @param {User}        emitter
     * @param {number|null} startSi emitter's sector (null = no-op)
     */
    noiseAlert(emitter, startSi) {
        if (startSi === null) {
            return;
        }
        this._stamp++;
        const sectorQ = [startSi];
        const blocksQ = [0];
        this._floodStamp[startSi]     = this._stamp;
        this._soundTraversed[startSi] = 1;
        let head = 0;
        while (head < sectorQ.length) {
            const si     = sectorQ[head];
            const blocks = blocksQ[head];
            head++;
            this._soundTarget[si] = emitter;
            for (const lineIdx of this._graph.bySector[si]) {
                const line  = this._graph.lines[lineIdx];
                const other = ((line.siR === si) ? line.siL : line.siR);
                if (this._openingOf(line) <= 0) {
                    continue;
                }
                let nextBlocks = blocks;
                if (line.soundBlock) {
                    if (blocks > 0) {
                        continue;
                    }
                    nextBlocks = 1;
                }
                // Vanilla soundtraversed: revisit only when the new path
                // carries fewer sound blocks than the recorded one.
                if ((this._floodStamp[other] === this._stamp) && (this._soundTraversed[other] <= nextBlocks + 1)) {
                    continue;
                }
                this._floodStamp[other]     = this._stamp;
                this._soundTraversed[other] = nextBlocks + 1;
                sectorQ.push(other);
                blocksQ.push(nextBlocks);
            }
        }
    }

    // --- Internal ---

    _rayClear(ox, oy, oz, tx, ty, tz) {
        const dx = tx - ox;
        const dy = ty - oy;
        const dz = tz - oz;
        const d  = Math.hypot(dx, dy, dz);
        if (d < 1e-6) {
            return true;
        }
        const hit = this._collision.raycast(ox, oy, oz, dx / d, dy / d, dz / d, d, {floors: true, ceilings: true, dynamic: true});
        return (hit === null);
    }

    // Current vertical opening of a two-sided line, in map units.
    _openingOf(line) {
        const a = this._effHeights(line.siR);
        const b = this._effHeights(line.siL);
        return (Math.min(a.ch, b.ch) - Math.max(a.fh, b.fh));
    }

    // Effective heights of a sector: the static (post-patch) values, corrected
    // by the live offset of its mover instance — a door's ceiling is its panel
    // bottom (closed rest = floor), a lift/rising floor/stair top rests at the
    // original height and carries the instance's current Y delta.
    _effHeights(si) {
        let fh = ((this._restFh[si] !== undefined) ? this._restFh[si] : this._sectors[si].fh);
        let ch = this._sectors[si].ch;
        const mover = this._mover(si);
        if (mover !== null) {
            const dy = mover.inst.getTransform().deltaTranslate[1] / WadConstants.SCALE;
            if (mover.kind === 'door') {
                ch = this._doorFloorH[si] + dy;
            } else {
                fh = fh + dy;
            }
        }
        return {fh: fh, ch: ch};
    }

    // Lazy mover resolution: the builder only lists codes it actually built,
    // so getByCode never throws here.
    _mover(si) {
        if (this._moverCache[si] === undefined) {
            const entry = this._moverCodes[si];
            this._moverCache[si] = ((entry !== undefined)
                ? {kind: entry.kind, inst: loader.instances().getByCode(entry.code)}
                : null);
        }
        return this._moverCache[si];
    }
}
