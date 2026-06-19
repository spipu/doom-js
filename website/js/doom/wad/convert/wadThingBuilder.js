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
     */
    constructor(level, catalog, spriteBank, sectorFinder) {
        this._level        = level;
        this._catalog      = catalog;
        this._spriteBank   = spriteBank;
        this._sectorFinder = sectorFinder;
    }

    /**
     * @returns {object[]} {key, texIds, animDuration, halfWidth, height,
     *                      anchorOffsetX, anchorTop, position:[x,y,z], kind, solid, radius, effect}
     */
    buildAll() {
        const scale  = WadConstants.SCALE;
        const result = [];
        this._skipped = 0;

        for (const thing of this._level.things) {
            const desc = this._catalog.getThingForType(thing.type);
            if (desc === null) {
                continue;
            }

            // No containing/near sector found → drop the thing rather than
            // mis-placing it at height 0.
            const sect = this._sectorFinder(thing.x, thing.y);
            if (sect === null) {
                this._skipped++;
                continue;
            }

            // Decode every animation frame; skip frames the WAD lacks, skip the
            // whole thing only if no frame is present.
            const sprites = desc.frames.map(name => this._spriteBank.get(name)).filter(s => s !== null);
            if (sprites.length === 0) {
                continue;
            }

            const first = sprites[0];
            // Hanging things anchor their top to the ceiling; the rest stand on the floor.
            const baseH = ((desc.ceiling) ? sect.ch : sect.fh);

            // Doom places the sprite top at floor+topoffset, so the foot lands at
            // topoffset-height — often a few px below the floor. Vanilla never
            // clips this vertically (no free look); like modern ports we floor-clip
            // floor things so feet never sink below the sector floor. Hanging things
            // keep their (negative) offset so they stay below the ceiling.
            const sink = first.topoffset - first.height;

            result.push({
                key:           desc.frames.join('|'),
                texIds:        sprites.map(s => s.loaderId),
                animDuration:  desc.animDuration,
                halfWidth:     (first.width * scale) / 2,
                height:        first.height * scale,
                // leftoffset centres the sprite horizontally; the vertical offset is
                // floor-clipped for floor things (see `sink` above).
                anchorOffsetX: ((first.width / 2) - first.leftoffset) * scale,
                anchorOffsetY: ((desc.ceiling) ? sink : Math.max(0, sink)) * scale,
                anchorTop:     desc.ceiling,
                light:         sect.light,
                position:      [thing.x * scale, baseH * scale, thing.y * scale],
                kind:          desc.kind,
                solid:         desc.solid,
                radius:        desc.radius,
                effect:        desc.effect
            });
        }

        return result;
    }

    // Number of mapped things dropped because no sector was found (call after buildAll).
    getSkipped() {
        return this._skipped;
    }
}
