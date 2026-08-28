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

    getAllDefs() {
        return Object.values(this._defs);
    }

    /**
     * A def by its own code rather than by editor number — how the runtime
     * spawners name what they spit (the elemental's lost soul).
     *
     * @returns {DoomMonsterDef|null}
     */
    getDefByCode(code) {
        return (this.getAllDefs().find((def) => (def.getCode() === code)) ?? null);
    }
}
