/**
 * Builds the world things (decorations + pickups) from the level THINGS lump.
 * Each mapped thing becomes a camera-facing Billboard sprite; enemies, player /
 * deathmatch starts and teleport landings are left out (not mapped in the
 * catalog). Phase 1 only displays them — no collision, no pickup interaction.
 *
 * Returns a flat list of placed things; WadWorldBuilder deduplicates the shared
 * Billboard Object3d per sprite and creates one Instance per occurrence.
 */
class WadThingBuilder {
    /**
     * @param {object}        level         parsed level ({things, vertexes, …})
     * @param {object}        catalog       thing catalog exposing getThingForType(type)
     * @param {WadSpriteBank} spriteBank    decodes sprite lumps to engine textures
     * @param {function}      sectorFinder  (doomX, doomY) → {fh, ch} in Doom units
     * @param {number}        skill         difficulty 1..5 (defaults to 3, HMP)
     */
    constructor(level, catalog, spriteBank, sectorFinder, skill = 3) {
        this._level        = level;
        this._catalog      = catalog;
        this._spriteBank   = spriteBank;
        this._sectorFinder = sectorFinder;
        this._skill        = skill;
        this._skipped  = 0;
        this._filtered = 0;
    }

    /**
     * @returns {object[]} {key, texIds, animDuration, halfWidth, height,
     *                      anchorOffsetX, anchorOffsetY, anchorTop, si, light,
     *                      position:[x,y,z], kind, solid, radius, effect}
     */
    buildAll() {
        const result   = [];
        const spawners = {};
        this._skipped  = 0;
        this._filtered = 0;

        // Skill bit for the chosen difficulty (Doom P_SpawnMapThing): a thing is
        // present only if its flags carry this bit. 1-2 → 0x01, 3 → 0x02, 4-5 → 0x04.
        const skillBit = ((this._skill <= 2) ? 0x01 : ((this._skill === 3) ? 0x02 : 0x04));

        for (const thing of this._level.things) {
            const desc = this._catalog.getThingForType(thing.type);
            if (desc === null) {
                continue;
            }

            // Spawner things are gathered per group BEFORE the single-player /
            // skill filtering: vanilla Heretic collects its mace spots at the
            // top of P_SpawnMapThing, so the multiplayer-only flag most spots
            // carry never applies to them. Only ONE random occurrence per
            // group materializes (a single mace per level).
            if (desc.spawnerGroup !== null) {
                const spot = this._sectorFinder(thing.x, thing.y);
                if (spot === null) {
                    this._skipped++;
                    continue;
                }
                if (spawners[desc.spawnerGroup] === undefined) {
                    spawners[desc.spawnerGroup] = [];
                }
                spawners[desc.spawnerGroup].push({thing, desc, sect: spot});
                continue;
            }

            // Single-player filtering, like the real game: skip multiplayer-only
            // things and things absent at the chosen difficulty.
            if ((thing.flags & WadConstants.MTF_NOT_SINGLE) !== 0) {
                this._filtered++;
                continue;
            }
            if ((thing.flags & skillBit) === 0) {
                this._filtered++;
                continue;
            }

            // No containing/near sector found → drop the thing rather than
            // mis-placing it at height 0.
            const sect = this._sectorFinder(thing.x, thing.y);
            if (sect === null) {
                this._skipped++;
                continue;
            }

            const entry = this._buildEntry(thing, desc, sect);
            if (entry !== null) {
                result.push(entry);
            }
        }

        for (const group of Object.keys(spawners)) {
            const candidates = spawners[group];
            const pick  = candidates[Math.floor(Math.random() * candidates.length)];
            const entry = this._buildEntry(pick.thing, pick.desc, pick.sect);
            if (entry !== null) {
                result.push(entry);
            }
        }

        return result;
    }

    // World descriptor of one placed thing; null when the WAD lacks every
    // sprite frame.
    _buildEntry(thing, desc, sect) {
        const scale = WadConstants.SCALE;

        // Decode every animation frame; skip frames the WAD lacks, skip the
        // whole thing only if no frame is present.
        const sprites = desc.frames.map((name) => this._spriteBank.get(name)).filter((s) => (s !== null));
        if (sprites.length === 0) {
            return null;
        }

        const first = sprites[0];
        // Hanging things anchor their top to the ceiling; the rest stand on the floor.
        const baseH = ((desc.ceiling) ? sect.ch : sect.fh);

        // Doom places the sprite top at floor+topOffset, so the foot lands at
        // topOffset-height — often a few px below the floor. Vanilla never
        // clips this vertically (no free look); like modern ports we floor-clip
        // floor things so feet never sink below the sector floor. Hanging things
        // keep their (negative) offset so they stay below the ceiling.
        const sink = first.topOffset - first.height;

        return {
            key:           desc.frames.join('|'),
            texIds:        sprites.map((s) => s.loaderId),
            animDuration:  desc.animDuration,
            halfWidth:     (first.width * scale) / 2,
            height:        first.height * scale,
            // leftOffset centres the sprite horizontally; the vertical offset is
            // floor-clipped for floor things (see `sink` above).
            anchorOffsetX: ((first.width / 2) - first.leftOffset) * scale,
            anchorOffsetY: ((desc.ceiling) ? sink : Math.max(0, sink)) * scale,
            anchorTop:     desc.ceiling,
            si:            sect.si,
            light:         sect.light,
            position:      WadGeometry.doomToWorld(thing.x, thing.y, baseH),
            kind:          desc.kind,
            solid:         desc.solid,
            radius:        desc.radius,
            effect:        desc.effect
        };
    }

    // Number of mapped things dropped because no sector was found (call after buildAll).
    getSkipped() {
        return this._skipped;
    }

    // Number of mapped things filtered out by skill / multiplayer flag (call after buildAll).
    getFiltered() {
        return this._filtered;
    }
}
