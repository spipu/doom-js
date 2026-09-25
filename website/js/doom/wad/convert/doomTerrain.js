/**
 * Terrain under a world point, and the splash a body hitting it leaves —
 * transcription of P_HitWater (p_mobj.cpp). The tables come from
 * WadTerrainBank: the game's own, overlaid by the WAD's TERRAIN lump.
 *
 * The terrain is read from the sector's LIVE floor flat, never from the face
 * the shot met: a "+change" floor rewrites that flat at runtime, and the
 * baked geometry would answer with the one the level was built on.
 *
 * Only the shot, the projectile, the falling body and the blast call
 * splashAt, so a chunk falling back into the liquid never splashes again —
 * what vanilla needs +DONTSPLASH for.
 */
class DoomTerrain {
    /**
     * @param {function}            sectorIndexAt (doomX, doomY) → sector index | null
     * @param {DoomSectorSurfaces}  surfaces      live floor flat of each sector
     * @param {object}              flats         flat name → terrain code
     * @param {object}              terrains      terrain code → splash definition
     */
    constructor(sectorIndexAt, surfaces, flats, terrains) {
        this._sectorIndexAt = sectorIndexAt;
        this._surfaces      = surfaces;
        this._flats         = flats;
        this._terrains      = terrains;
        this._effects       = null;
        this._tints         = {};
        // A stream of its own (vanilla's pr_chunk), NOT the game's table: of
        // the four paths that splash, only the falling body exists in the
        // original, so drawing the other three from the shared table would
        // shift every later roll of the game away from it.
        this._rng           = new DoomRandom();
    }

    /**
     * The spawner of the splashes. Pushed by the game rather than taken at
     * construction: the effects are built after the world they belong to.
     *
     * @param {DoomEffects} effects
     */
    setEffects(effects) {
        this._effects = effects;

        return this;
    }

    /**
     * Average colour of each liquid flat the level actually uses, measured on
     * the flat's own pixels at build time: what the generic splash is
     * colourised with.
     *
     * @param {object} tints flat name (uppercase) → [r, g, b]
     */
    setLiquidTints(tints) {
        this._tints = tints;

        return this;
    }

    /**
     * @returns {object} flat name → [r, g, b]
     */
    liquidTints() {
        return this._tints;
    }

    /**
     * True when the flat already shows something of its own, from the game or
     * from the WAD's TERRAIN lump — the generic splash then stays out of it.
     *
     * @param {string} flat uppercase flat name
     * @returns {boolean}
     */
    splashesOnFlat(flat) {
        const terrain = (this._terrains[this._flats[flat]] ?? null);
        if (terrain === null) {
            return false;
        }

        return (((terrain.base ?? null) !== null) || ((terrain.chunk ?? null) !== null));
    }

    /**
     * Give one flat a terrain built after the level, for the generic splash:
     * its frames only exist once the flat's colour is known.
     *
     * @param {string} flat    uppercase flat name
     * @param {string} code    the terrain code minted for it
     * @param {object} terrain its splash definition
     */
    addFlatTerrain(flat, code, terrain) {
        this._terrains[code] = terrain;
        this._flats[flat]    = code;

        return this;
    }

    /**
     * @param {number} worldX
     * @param {number} worldZ
     * @returns {object|null} the terrain's splash definition, null on dry ground
     */
    terrainAt(worldX, worldZ) {
        const si = this._sectorIndexAt(worldX / WadConstants.SCALE, worldZ / WadConstants.SCALE);
        if (si === null) {
            return null;
        }
        const code = this._flats[this._surfaces.flatOf(si).toUpperCase()];

        return ((code !== undefined) ? (this._terrains[code] ?? null) : null);
    }

    /**
     * Splash where a shot or a shell ended its flight: only a hit on the
     * GROUND disturbs the liquid — vanilla splashes on TRACE_HitFloor alone,
     * so a wall or a ceiling leaves it be.
     *
     * @param {object} hit a Collision.raycast result
     * @returns {boolean} true when a splash was spawned
     */
    splashAtHit(hit) {
        if (hit.tri.kind !== Collision.KIND_FLOOR) {
            return false;
        }

        return this.splashAt(hit.point[0], hit.point[1], hit.point[2]);
    }

    /**
     * Splash of the terrain under a point: the ripple where it was born, the
     * chunk thrown out of it, and the sound. A silent no-op on dry ground, and
     * on a liquid whose terrain declares no splash (the whole Doom family).
     *
     * @param {number} x, y, z world point, y on the liquid surface
     * @returns {boolean} true when a splash was spawned
     */
    splashAt(x, y, z) {
        const terrain = this.terrainAt(x, z);
        if ((terrain === null) || (this._effects === null)) {
            return false;
        }
        const base  = (terrain.base ?? null);
        const chunk = (terrain.chunk ?? null);
        const sound = (terrain.sound ?? null);
        // A WAD may name a splash actor no profile builds: report the silence
        // rather than swallow the caller's own effect.
        let spawned = false;
        if (base !== null) {
            spawned = ((this._effects.spawn(base, x, y, z, {mirror: this._mirror()}) !== null) || spawned);
        }
        if (chunk !== null) {
            // Locals pin the random draw order, like _chunkVelocity.
            const velocity = this._chunkVelocity(terrain.chunkVel);
            const mirror   = this._mirror();
            const roll     = this._roll(terrain.chunkSpin ?? null);
            const spawn    = this._effects.spawn(chunk, x, y, z, {velocity: velocity, mirror: mirror, roll: roll});
            spawned = ((spawn !== null) || spawned);
        }
        if (sound !== null) {
            doomSound.playAt(sound, [x, y, z]);
            spawned = true;
        }

        return spawned;
    }

    // Half the splashes face the other way, so the same picture is not stamped
    // on every impact. Our own addition — vanilla mirrors nothing here — hence
    // this object's stream rather than the game's.
    _mirror() {
        return ((this._rng.next() & 1) === 1);
    }

    // A piece thrown out of the liquid is tumbling, so it is drawn at an angle
    // of its own within `spin` degrees either side of upright — a terrain that
    // declares none keeps its chunk straight, as every original game does.
    _roll(spin) {
        if (spin === null) {
            return 0;
        }

        return (((this._rng.next() / DoomRandom.MAX) - 0.5) * 2 * spin * DEG_TO_RAD);
    }

    // P_HitWater, fixed-point arithmetic kept as written. Held in locals rather
    // than built inline, to pin the draw order to the source's: Doom x, Doom y,
    // then up.
    _chunkVelocity(spec) {
        const x  = this._sideways(spec.xVelShift);
        const z  = this._sideways(spec.yVelShift);
        const up = (spec.baseZVel + ((this._rng.next() * (1 << spec.zVelShift)) / 65536));

        return [x, up, z];
    }

    // A null shift is the lump's 255 sentinel: that axis is never assigned, so
    // it costs no draw either — the chunk simply goes straight up.
    _sideways(shift) {
        if (shift === null) {
            return 0;
        }

        return ((this._rng.nextDiff() * (1 << shift)) / 65536);
    }
}
