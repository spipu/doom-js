/**
 * Catalog of the world THINGS (decorations + pickups) — the single, generic
 * resolver mapping an editor number to what appears in the world. The DATA
 * (decoration definitions + per-type table) is per-game and comes from the
 * game profile (thingDecorations / thingTypes); this class only carries the
 * resolution mechanics, shared by every game.
 *
 * Decorations are DoomDecoration definitions (sprite + solid + radius +
 * ceiling); pickups carry their sprite + a gameplay `effect` consumed when
 * picked up. Enemies, starts and teleport landings are absent from the
 * tables on purpose (not displayed, resolved to null).
 */
class DoomThingCatalog {
    /**
     * @param {object} decorations - code → DoomDecoration
     * @param {object} thingTypes  - editor number → {kind, sprite|code, frames?, animDuration?, solid?, effect?}
     */
    constructor(decorations, thingTypes) {
        this._decorations = decorations;
        this._thingTypes  = thingTypes;
    }

    // Rotation-0 lump names of an animated sprite:
    // ('BON1', 'ABCD') → ['BON1A0', 'BON1B0', 'BON1C0', 'BON1D0'].
    static animFrames(base, letters) {
        const frames = [];
        for (const letter of letters) {
            frames.push(base + letter + '0');
        }
        return frames;
    }

    // Resolve a THING type to a uniform world descriptor, or null if the
    // type is not a displayed thing (enemy, start, teleport landing, unknown).
    getThingForType(type) {
        const entry = this._thingTypes[type];
        if (entry === undefined) {
            return null;
        }
        // A spot only keeps its position, filed under its group: D'Sparil's
        // 'bossSpot' and the Icon of Sin's 'bossTarget' lists must never mix.
        if (entry.kind === 'spot') {
            return {kind: 'spot', spotGroup: entry.group, code: null, frames: [], animDuration: 0,
                solid: false, radius: 0, ceiling: false, effect: null, spawnerGroup: null};
        }
        if (entry.kind === 'decoration') {
            const decoration = this._decorations[entry.code];
            return {
                kind:         'decoration',
                code:         entry.code,
                frames:       (entry.frames ?? [decoration.getSprite()]),
                animDuration: (entry.animDuration ?? 0),
                solid:        ((entry.solid !== undefined) ? (entry.solid === true) : decoration.isSolid()),
                radius:       decoration.getRadius(),
                ceiling:      decoration.isCeiling(),
                effect:       null,
                spawnerGroup: null
            };
        }
        return {
            kind:         'pickup',
            code:         null,
            frames:       (entry.frames ?? [entry.sprite]),
            animDuration: (entry.animDuration ?? 0),
            solid:        false,
            radius:       0,
            ceiling:      false,
            effect:       entry.effect,
            // Spawner things sharing a group key: only ONE random occurrence
            // per group materializes each level (Heretic MaceSpawner).
            spawnerGroup: (entry.spawnerGroup ?? null)
        };
    }
}
