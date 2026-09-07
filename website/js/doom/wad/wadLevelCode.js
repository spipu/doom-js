/**
 * Level codes of the Doom map format, parsed in one place: "ExMy" for the
 * episodic games, "MAPnn" for the flat ones, case-insensitive. Everything that
 * reasons on a level name — progression, episode grouping, music, skies,
 * titles, DEHACKED keys — asks here instead of matching the patterns itself.
 */
class WadLevelCode {
    /**
     * @param {string} levelCode
     * @returns {{episode: number|null, map: number|null, number: number|null}}
     *          episode/map set for "ExMy", number for "MAPnn", all null otherwise
     */
    static parse(levelCode) {
        const episodic = WadLevelCode.EPISODIC.exec(levelCode);
        if (episodic !== null) {
            return {episode: parseInt(episodic[1], 10), map: parseInt(episodic[2], 10), number: null};
        }
        const flat = WadLevelCode.FLAT.exec(levelCode);
        if (flat !== null) {
            return {episode: null, map: null, number: parseInt(flat[1], 10)};
        }

        return {episode: null, map: null, number: null};
    }

    static isEpisodic(levelCode) {
        return (WadLevelCode.parse(levelCode).episode !== null);
    }
}

WadLevelCode.EPISODIC = /^E(\d)M(\d)$/i;
WadLevelCode.FLAT     = /^MAP(\d\d)$/i;
