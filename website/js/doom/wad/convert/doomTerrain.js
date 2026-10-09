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
     * @param {DoomTurnEvents}      events        where the splash sounds go
     */
    constructor(sectorIndexAt, surfaces, flats, terrains, events) {
        this._sectorIndexAt = sectorIndexAt;
        this._surfaces      = surfaces;
        this._flats         = flats;
        this._terrains      = terrains;
        this._events        = events;
        this._effects       = null;
        this._tints         = {};
        this._heights       = null;   // DoomSectorHeights, once the level data exists
        this._surfaceOf     = null;   // (si) → water line above the live floor, Doom units, null when none
        this._floorOffsetOf = null;   // (si) → physical floor below the live one, Doom units (<= 0)
        // A stream of its own (vanilla's pr_chunk), NOT the game's table: of
        // the four paths that splash, only the falling body exists in the
        // original, so drawing the other three from the shared table would
        // shift every later roll of the game away from it.
        this._rng           = new DoomRandom();
    }

    /**
     * The spawner of the splashes. Pushed by the simulation rather than taken
     * at construction: it owns the spawner and adopts the level after the build.
     *
     * @param {DoomEffectSpawner} effects
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
     * Where the water line of each sector stands: a splash is born on it, not
     * on the floor under it.
     *
     * @param {DoomSectorHeights} heights
     * @param {function}          surfaceOf     (si) → Doom units above the live floor, null without a water line
     * @param {function}          floorOffsetOf (si) → Doom units the physical floor lies below the live one
     */
    setSurface(heights, surfaceOf, floorOffsetOf) {
        this._heights       = heights;
        this._surfaceOf     = surfaceOf;
        this._floorOffsetOf = floorOffsetOf;

        return this;
    }

    /**
     * How deep a body standing at this point is sunk under the water line:
     * its steps are measured from that line, as vanilla's floor IS the line.
     *
     * @returns {number} world units, 0 off a sunk floor or above it
     */
    sinkAt(worldX, worldY, worldZ) {
        const si = ((this._heights !== null) ? this._sectorAt(worldX, worldZ) : null);
        if (si === null) {
            return 0;
        }
        const offset = this._floorOffsetOf(si);
        if (offset === 0) {
            return 0;
        }
        const floorY = (this._heights.floorOf(si) + offset) * WadConstants.SCALE;

        return ((Math.abs(worldY - floorY) <= WadConstants.ON_FLOOR_TOLERANCE) ? (-offset * WadConstants.SCALE) : 0);
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
        return this._terrainOf(this._sectorAt(worldX, worldZ));
    }

    _sectorAt(worldX, worldZ) {
        return this._sectorIndexAt(worldX / WadConstants.SCALE, worldZ / WadConstants.SCALE);
    }

    _terrainOf(si) {
        if (si === null) {
            return null;
        }
        const code = this._flats[this._surfaces.flatOf(si).toUpperCase()];

        return ((code !== undefined) ? (this._terrains[code] ?? null) : null);
    }

    _surfaceY(si, y) {
        if ((this._heights === null) || (si === null)) {
            return y;
        }
        const line = this._surfaceOf(si);

        return ((line !== null) ? ((this._heights.floorOf(si) + line) * WadConstants.SCALE) : y);
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
     * @param {number} x    world X
     * @param {number} yHit height of the impact, moved up to the sector's water line when it has one
     * @param {number} z    world Z
     * @returns {boolean} true when a splash was spawned
     */
    splashAt(x, yHit, z) {
        const si      = this._sectorAt(x, z);
        const terrain = this._terrainOf(si);
        if ((terrain === null) || (this._effects === null)) {
            return false;
        }
        const y = this._surfaceY(si, yHit);
        const base  = (terrain.base ?? null);
        const chunk = (terrain.chunk ?? null);
        const sound = (terrain.sound ?? null);
        // A WAD may name a splash actor no profile builds: report the silence
        // rather than swallow the caller's own effect.
        let spawned = false;
        if (base !== null) {
            spawned = (this._effects.spawn(base, x, y, z, {mirror: this._mirror()}) || spawned);
        }
        if (chunk !== null) {
            // Locals pin the random draw order, like _chunkVelocity.
            const velocity = this._chunkVelocity(terrain.chunkVel);
            const mirror   = this._mirror();
            const roll     = this._roll(terrain.chunkSpin ?? null);
            spawned = (this._effects.spawn(chunk, x, y, z, {velocity: velocity, mirror: mirror, roll: roll}) || spawned);
        }
        if (sound !== null) {
            this._events.soundAt(sound, [x, y, z]);
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
