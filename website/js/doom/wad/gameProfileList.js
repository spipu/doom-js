/**
 * Registry of the game profiles (same pattern as Object3dRendererList).
 * Every game registers one profile instance here; getForWad probes them in
 * order (most specific first — freedoom also carries M_DOOM) and falls back
 * to the default profile: an unknown WAD (any PWAD/IWAD without a recognized
 * signature) is treated as a plain doom-format WAD.
 *
 * Adding a game = one DefaultGameProfile subclass + one entry in _profiles.
 */
class GameProfileList {
    constructor() {
        this._profiles = [
            new HereticGameProfile(),
            new FreedoomGameProfile(),
            new DoomGameProfile()
        ];
        this._fallback = new DefaultGameProfile();
    }

    /**
     * @param {WadFile} wadFile
     * @returns {AbstractGameProfile}
     */
    getForWad(wadFile) {
        for (const profile of this._profiles) {
            if (profile.matchesWad(wadFile)) {
                return profile;
            }
        }

        return this._fallback;
    }

    /**
     * @param {string} code
     * @returns {AbstractGameProfile} the fallback profile when unknown
     */
    getByCode(code) {
        for (const profile of this._profiles) {
            if (profile.getCode() === code) {
                return profile;
            }
        }

        return this._fallback;
    }

    /**
     * Every registered profile plus the fallback — for the boot-time loaders
     * that must cover all games before any WAD is picked (decal graphics).
     *
     * @returns {AbstractGameProfile[]}
     */
    getAll() {
        return [...this._profiles, this._fallback];
    }
}
