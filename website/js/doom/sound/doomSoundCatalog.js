/**
 * Generic resolver of a game's logical sound names — the SNDINFO table the
 * profile transcribes: name → {lump | alias | random[]} plus the per-sound
 * attributes ($limit, $pitchshift, $singular).
 *
 * Sounds resolve BY NAME only, never by sniffing lump headers (a map lump can
 * pass the DMX format test). A name the table does not carry degrades to null
 * — a game may not define every event, and a WAD may lack a lump the table
 * names (heretic.wad has no dssecret): silence, never a throw.
 */
class DoomSoundCatalog {
    // Chain guard: aliases and random groups reference other logical names, a
    // circular table must not hang the resolver.
    static MAX_CHAIN = 8;

    /**
     * @param {object} defs name → {lump?, alias?, random?, limit?, limitRange?, pitch?, singular?}
     */
    constructor(defs) {
        this._defs = defs;
    }

    /**
     * Every WAD lump the table references — what the sound system decodes when
     * a WAD is selected.
     *
     * @returns {string[]} unique lump names
     */
    lumpNames() {
        const names = new Set();
        for (const name of Object.keys(this._defs)) {
            const lump = this._defs[name].lump;
            if (lump !== undefined) {
                names.add(lump);
            }
        }

        return [...names];
    }

    /**
     * Resolves a logical name down to its lump, following aliases and picking
     * one entry of a $random group per call. An attribute set anywhere along
     * the chain wins over the target's (an alias inherits the limit of its
     * target when it sets none — the NearLimit -1 of the UZDoom $alias).
     *
     * @param {string} name e.g. 'menu/choose'
     * @returns {{lump: string, limit: number, limitRange: number, pitch: number|null, singular: boolean}|null}
     */
    resolve(name) {
        let lump       = null;
        let limit      = null;
        let limitRange = null;
        let pitch      = null;
        let singular   = null;

        let current = name;
        for (let step = 0; step < DoomSoundCatalog.MAX_CHAIN; step++) {
            const def = this._defs[current];
            if (def === undefined) {
                return null;
            }
            limit      = (limit      ?? def.limit      ?? null);
            limitRange = (limitRange ?? def.limitRange ?? null);
            pitch      = (pitch      ?? def.pitch      ?? null);
            singular   = (singular   ?? def.singular   ?? null);

            if (def.lump !== undefined) {
                lump = def.lump;
                break;
            }
            if (def.alias !== undefined) {
                current = def.alias;
                continue;
            }
            if (def.random !== undefined) {
                current = def.random[Math.floor(Math.random() * def.random.length)];
                continue;
            }

            return null;
        }
        if (lump === null) {
            return null;
        }

        return {
            lump:       lump,
            limit:      (limit ?? WadConstants.SOUND_NEAR_LIMIT),
            limitRange: (limitRange ?? WadConstants.SOUND_NEAR_LIMIT_RANGE),
            pitch:      pitch,
            singular:   (singular === true)
        };
    }
}
