/**
 * TNT: Evilution profile (REDTNT2 sky texture, UZDoom iwadinfo). Same
 * behaviour as the id Doom II profile with its own level names; its finale
 * texts (T1TEXT…) are not transcribed, so its chapter ends stay silent.
 */
class TntGameProfile extends DoomGameProfile {
    getCode() {
        return 'tnt';
    }

    /**
     * @param {WadFile} wadFile
     * @returns {boolean}
     */
    matchesWad(wadFile) {
        return (wadFile.getLump('REDTNT2') !== null);
    }

    finaleAssets() {
        return null;
    }

    levelNameStringPrefix() {
        return 'THUSTR';
    }

    // Level names of TNT: Evilution (linuxdoom d_englsh.h THUSTR_*), without
    // the "level n: " prefix, normalized to title case like the Doom II ones.
    levelNames() {
        return {
            MAP01: 'System Control',
            MAP02: 'Human BBQ',
            MAP03: 'Power Control',
            MAP04: 'Wormhole',
            MAP05: 'Hanger',
            MAP06: 'Open Season',
            MAP07: 'Prison',
            MAP08: 'Metal',
            MAP09: 'Stronghold',
            MAP10: 'Redemption',
            MAP11: 'Storage Facility',
            MAP12: 'Crater',
            MAP13: 'Nukage Processing',
            MAP14: 'Steel Works',
            MAP15: 'Dead Zone',
            MAP16: 'Deepest Reaches',
            MAP17: 'Processing Area',
            MAP18: 'Mill',
            MAP19: 'Shipping/Respawning',
            MAP20: 'Central Processing',
            MAP21: 'Administration Center',
            MAP22: 'Habitat',
            MAP23: 'Lunar Mining Project',
            MAP24: 'Quarry',
            MAP25: 'Baron\'s Den',
            MAP26: 'Ballistyx',
            MAP27: 'Mount Pain',
            MAP28: 'Heck',
            MAP29: 'River Styx',
            MAP30: 'Last Call',
            MAP31: 'Pharaoh',
            MAP32: 'Caribbean'
        };
    }
}
