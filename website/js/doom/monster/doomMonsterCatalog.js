/**
 * Generic resolver THING editor number → DoomMonsterDef. Pure mechanics, the
 * data table is injected by the game profile (monsterDefs()) — same pattern
 * as DoomThingCatalog for decorations/pickups.
 */
class DoomMonsterCatalog {
    /**
     * @param {object} defs editor number → DoomMonsterDef
     */
    constructor(defs) {
        this._defs = defs;
    }

    /**
     * @param {int} type THING editor number
     * @returns {DoomMonsterDef|null}
     */
    getMonsterForType(type) {
        return (this._defs[type] ?? null);
    }
}
