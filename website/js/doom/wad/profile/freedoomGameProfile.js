/**
 * Freedoom profile (FREEDOOM credits lump — phases 1 & 2 and FreeDM). Same
 * behaviour as the id Doom baseline, except the art shades that differ in
 * the Freedoom asset set (bluish BFG lightning instead of green).
 */
class FreedoomGameProfile extends DefaultGameProfile {
    getCode() {
        return 'freedoom';
    }

    /**
     * @param {WadFile} wadFile
     * @returns {boolean}
     */
    matchesWad(wadFile) {
        return ((wadFile.getLump('FREEDOOM') !== null) || (wadFile.getLump('FREEDM') !== null));
    }

    bfgDecalShade() {
        return [128, 128, 255];
    }
}
