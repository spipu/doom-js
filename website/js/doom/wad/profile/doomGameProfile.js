/**
 * id Software Doom/Doom II profile (M_DOOM title graphic). Identical to the
 * default profile today — it exists so the id IWADs are named explicitly and
 * ready to diverge from the generic doom-format baseline when needed.
 */
class DoomGameProfile extends DefaultGameProfile {
    getCode() {
        return 'doom';
    }

    /**
     * @param {WadFile} wadFile
     * @returns {boolean}
     */
    matchesWad(wadFile) {
        return (wadFile.getLump('M_DOOM') !== null);
    }
}
