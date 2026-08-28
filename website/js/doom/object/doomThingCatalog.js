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

    // Build the rotation-0 lump names for an animated sprite, e.g.
    // ('BON1', 'ABCD') → ['BON1A0', 'BON1B0', 'BON1C0', 'BON1D0'].
    // Static: the profiles use it while building their data tables.
    static animFrames(base, letters) {
        const result = [];
        for (const ch of letters) {
            result.push(base + ch + '0');
        }
        return result;
    }

    // Resolve a THING type to a uniform world descriptor, or null if the
    // type is not a displayed thing (enemy, start, teleport landing, unknown).
    getThingForType(type) {
        const entry = this._thingTypes[type];
        if (entry === undefined) {
            return null;
        }
        // A boss teleport spot is not a body: nothing is drawn, only its
        // position is kept (D'Sparil hops from one to the next).
        if (entry.kind === 'bossSpot') {
            return {kind: 'bossSpot', code: null, frames: [], animDuration: 0,
                solid: false, radius: 0, ceiling: false, effect: null, spawnerGroup: null};
        }
        if (entry.kind === 'decoration') {
            const def = this._decorations[entry.code];
            return {
                kind:         'decoration',
                code:         entry.code,
                frames:       (entry.frames ?? [def.getSprite()]),
                animDuration: (entry.animDuration ?? 0),
                solid:        ((entry.solid !== undefined) ? (entry.solid === true) : def.isSolid()),
                radius:       def.getRadius(),
                ceiling:      def.isCeiling(),
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
