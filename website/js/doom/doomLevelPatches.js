/**
 * Map patch catalogs of the games (UZDoom's LevelCompatibility transcribed,
 * see website/assets/uzdoom/), fetched once at app startup like the finale
 * texts: every profile contributes its levelPatchAssets() URL, and all of them
 * load up front since the WAD is only known later.
 *
 * A catalog maps the SHA-256 fingerprint of a map's own lumps
 * (WadFile.mapChecksum) to its patch list, so a map is recognised whatever the
 * WAD that carries it and never mistaken for another edition of the same name.
 * Nothing waits on these files: a catalog that fails to load leaves its maps
 * unpatched.
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
