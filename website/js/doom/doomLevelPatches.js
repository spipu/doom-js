/**
 * Map patch catalogs of the games (UZDoom's LevelCompatibility transcribed,
 * see website/assets/uzdoom/), fetched at startup like the finale texts and
 * keyed by the SHA-256 of a map's own lumps (WadFile.mapChecksum): a map is
 * recognised whatever WAD carries it. A catalog that fails to load leaves its
 * maps unpatched.
 */
class DoomLevelPatches {
    constructor() {
        this._entries = new Map();
    }

    load() {
        const seen = new Set();
        for (const profile of new GameProfileList().getAll()) {
            const url = profile.levelPatchAssets();
            if ((url === null) || seen.has(url)) {
                continue;
            }
            seen.add(url);
            appBootstrap.fetchJson(url, (catalog) => this._merge(catalog));
        }
    }

    /**
     * @param {string|null} checksum
     * @returns {{map: string, source: string, actions: object[]}|null}
     */
    get(checksum) {
        return ((checksum !== null) ? (this._entries.get(checksum) ?? null) : null);
    }

    _merge(catalog) {
        for (const [checksum, entry] of Object.entries(catalog)) {
            this._entries.set(checksum, entry);
        }
    }
}

// Global instance (loaded once from doom/main.js), like doomFinaleTexts.
const doomLevelPatches = new DoomLevelPatches();
