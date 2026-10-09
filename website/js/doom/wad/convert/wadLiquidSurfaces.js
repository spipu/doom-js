/**
 * The water line of every liquid sector, from the terrain's footclip and the
 * profile's policy: a sunk floor (Heretic, the sprites stand FOOTCLIPSIZE
 * deep) or a translucent sheet raised over an untouched floor (Doom family,
 * our own addition), and the sheet itself: an instance bodies walk through
 * and shots stop on, like vanilla's floor which IS the water line. A sheet
 * over a floor mover rides it as an instance of its own; every still sheet
 * of the level is merged into one, indexed once by the collision.
 */
class WadLiquidSurfaces {
    /**
     * @param {object}           level
     * @param {object}           analysis
     * @param {WadTextureBank}   bank
     * @param {WadAnimationBank} animBank
     * @param {WadTerrainBank}   terrains
     * @param {object}           policy - profile.liquidSurface(): {mode: 'none'|'sink'|'raise', alpha, bedDarkening}
     * @param {boolean}          sheets - false: no sheet nor darker bed, a sunk floor stays sunk
     */
    constructor(level, analysis, bank, animBank, terrains, policy, sheets) {
        this._level    = level;
        this._analysis = analysis;
        this._bank     = bank;
        this._animBank = animBank;
        this._terrains = terrains;
        this._policy   = policy;
        this._sheets   = sheets;
        this._floor    = {};   // si → physical floor offset (Doom units, <= 0)
        this._surface  = {};   // si → water line above the logical rest floor (>= 0)
    }

    init() {
        if (this._policy.mode === WadLiquidSurfaces.MODE_NONE) {
            return this;
        }
        const {sectors} = this._level;
        for (let si = 0; si < sectors.length; si++) {
            const clip = ((this._bank.isLiquidFlat(sectors[si].ft)) ? this._terrains.footclipOf(sectors[si].ft) : 0);
            // A "+change" floor may turn dry at runtime: it keeps the plain floor.
            if ((clip <= 0) || (this._analysis.floorChange[si] !== undefined)) {
                continue;
            }
            if (this._policy.mode === WadLiquidSurfaces.MODE_SINK) {
                this._floor[si] = -clip;
            }
            if (!this._sheets) {
                continue;
            }
            if (this._policy.mode === WadLiquidSurfaces.MODE_SINK) {
                this._surface[si] = 0;
                continue;
            }
            const line = Math.min(clip, this._bankHeight(si));
            if (line > 0) {
                this._surface[si] = line;
            }
        }

        return this;
    }

    // Physical floor of a sector relative to its logical one: the geometry,
    // the collision and the things read it, the analysis never does.
    floorOffset(si) {
        return (this._floor[si] ?? 0);
    }

    // Water line above the logical floor, null when the sector has none.
    surfaceOffset(si) {
        return (this._surface[si] ?? null);
    }

    bedLight(si) {
        const light = this._level.sectors[si].light;
        if (this._surface[si] === undefined) {
            return light;
        }

        return Math.round(light * (1 - this._policy.bedDarkening));
    }

    /**
     * @returns {object[]} [{code, textures, mesh, instanceData, rideCode}]: the sheets riding a
     *                     floor mover, one per sector in ascending order, then the still ones merged
     */
    buildAll() {
        const built = [];
        const still = WadMeshBuilder.newMesh();
        for (const si of Object.keys(this._surface).map(Number).sort((a, b) => (a - b))) {
            const rideCode = (this._analysis.floorMovers.get(si)?.code ?? null);
            if (rideCode === null) {
                this._addSurface(still, si);
                continue;
            }
            const mesh = WadMeshBuilder.newMesh();
            this._addSurface(mesh, si);
            const surface = this._finish(mesh, WadLiquidSurfaces.CODE_PREFIX + si, rideCode);
            if (surface !== null) {
                built.push(surface);
            }
        }
        const merged = this._finish(still, WadLiquidSurfaces.STATIC_CODE, null);
        if (merged !== null) {
            built.push(merged);
        }

        return built;
    }

    // --- Internal ---

    // Water never stands above its lowest bank: the lowest non-liquid floor
    // around the sector, the ceiling at most. A bank at floor level leaves no
    // sheet at all, the real floor then splashes as before.
    _bankHeight(si) {
        const {linedefs, sidedefs, sectors} = this._level;
        const fh = this._restFloor(si);
        let bank = sectors[si].ch - fh;
        for (const ld of linedefs) {
            if ((ld.right < 0) || (ld.left < 0)) {
                continue;
            }
            const rSi = sidedefs[ld.right].sector;
            const lSi = sidedefs[ld.left].sector;
            const other = ((rSi === si) ? lSi : ((lSi === si) ? rSi : null));
            if ((other === null) || (other === si) || this._bank.isLiquidFlat(sectors[other].ft)) {
                continue;
            }
            bank = Math.min(bank, this._restFloor(other) - fh);
        }

        return Math.max(0, bank);
    }

    // The water standing above the floor shows on the edges toward a lower
    // neighbour: a translucent band from what that side stands on up to the line.
    _buildSides(mesh, si, ft) {
        const {vertexes, linedefs, sidedefs, sectors} = this._level;
        const SCALE       = WadConstants.SCALE;
        const line        = this._waterLine(si);
        const {width, height} = this._bank.getDims(ft);
        for (const ld of linedefs) {
            if ((ld.right < 0) || (ld.left < 0)) {
                continue;
            }
            const rSi = sidedefs[ld.right].sector;
            const lSi = sidedefs[ld.left].sector;
            const neighbourSi = ((rSi === si) ? lSi : ((lSi === si) ? rSi : null));
            if ((neighbourSi === null) || (neighbourSi === si)) {
                continue;
            }
            const bottom = Math.max(this._physicalFloor(si), this._topOf(neighbourSi));
            if (bottom >= line) {
                continue;
            }
            const [wx1, wz1] = WadGeometry.doomToWorld(...vertexes[ld.v1]);
            const [wx2, wz2] = WadGeometry.doomToWorld(...vertexes[ld.v2]);
            WadMeshBuilder.addWallQuad(mesh, ft, wx1, wz1, wx2, wz2, bottom * SCALE, line * SCALE,
                WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2), width, height,
                {flip: (neighbourSi === rSi), light: sectors[si].light, alpha: this._policy.alpha, shotOnly: true, noDecal: true});
        }
    }

    _waterLine(si) {
        return (this._restFloor(si) + this._surface[si]);
    }

    _physicalFloor(si) {
        return (this._restFloor(si) + this.floorOffset(si));
    }

    // What a neighbour shows at its edge: its own water line, else its floor.
    _topOf(si) {
        return ((this._surface[si] !== undefined) ? this._waterLine(si) : this._physicalFloor(si));
    }

    // Logical rest floor: a lift's sector height is patched to its low end.
    _restFloor(si) {
        return (this._analysis.liftOriginalFh[si] ?? this._level.sectors[si].fh);
    }

    _addSurface(mesh, si) {
        const sec = this._level.sectors[si];
        const ft  = this._bank.ensureFlatTex(sec.ft);
        if (ft < 0) {
            return;
        }
        WadMeshBuilder.addSectorFlat(mesh, this._level, ft, si, this._waterLine(si), true, sec.light,
            {...WadMeshBuilder.floorFlatOptions(this._level, this._bank, this._analysis, si), noDecal: true, shotOnly: true, alpha: this._policy.alpha});
        this._buildSides(mesh, si, ft);
    }

    // A riding sheet is a collider retransformed with its mover; the merged
    // still one is indexed once by the collision, like the map.
    _finish(mesh, code, rideCode) {
        if (mesh.points.length === 0) {
            return null;
        }
        const groups = this._animBank.buildAnimGroups(WadMeshBuilder.remapLocalTextures(mesh.faces));
        WadMeshBuilder.applyAnimMap(mesh.faces, groups.animMap);

        return {
            code:     code,
            textures: groups.newList,
            mesh:     mesh,
            rideCode: rideCode,
            instanceData: {
                code:              code,
                position:          [0, 0, 0],
                rotation:          [0, 0, 0],
                trigger:           'none',
                loop:              false,
                onlyOnce:          false,
                collisionShape:    ((rideCode !== null) ? 'faces' : 'static'),
                interactionRadius: null,
                damage:            null,
                keyframes:         []
            }
        };
    }
}

WadLiquidSurfaces.MODE_NONE   = 'none';
WadLiquidSurfaces.MODE_SINK   = 'sink';
WadLiquidSurfaces.MODE_RAISE  = 'raise';
WadLiquidSurfaces.CODE_PREFIX = 'liquid_';
WadLiquidSurfaces.STATIC_CODE = WadLiquidSurfaces.CODE_PREFIX + 'static';
