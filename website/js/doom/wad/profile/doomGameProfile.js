/**
 * id Software Doom/Doom II profile (M_DOOM title graphic). Same behaviour as
 * the default profile, plus the id episode titles.
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

    finaleAssets() {
        return '/assets/uzdoom/doom/text/finale.json';
    }

    // Episode titles of Doom 1 (UZDoom mapinfo/doom1.txt episode blocks).
    // Doom 2 (MAPxx) has none: its single episode only shows its number.
    episodeNames() {
        return {
            E1M1: 'Knee-Deep in the Dead',
            E2M1: 'The Shores of Hell',
            E3M1: 'Inferno',
            E4M1: 'Thy Flesh Consumed'
        };
    }
}
