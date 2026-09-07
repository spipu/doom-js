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
        return '/assets/uzdoom/doom/texts.json';
    }

    levelPatchAssets() {
        return '/assets/uzdoom/doom/levelPatches.json';
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

    // Level names of Doom and Doom II (linuxdoom d_englsh.h HUSTR_*), without
    // the "E1M1: " / "level 1: " prefix. The Doom II strings are lowercase in
    // the source (drawn by an uppercase-only font): normalized to title case.
    levelNames() {
        return {
            E1M1: 'Hangar',
            E1M2: 'Nuclear Plant',
            E1M3: 'Toxin Refinery',
            E1M4: 'Command Control',
            E1M5: 'Phobos Lab',
            E1M6: 'Central Processing',
            E1M7: 'Computer Station',
            E1M8: 'Phobos Anomaly',
            E1M9: 'Military Base',
            E2M1: 'Deimos Anomaly',
            E2M2: 'Containment Area',
            E2M3: 'Refinery',
            E2M4: 'Deimos Lab',
            E2M5: 'Command Center',
            E2M6: 'Halls of the Damned',
            E2M7: 'Spawning Vats',
            E2M8: 'Tower of Babel',
            E2M9: 'Fortress of Mystery',
            E3M1: 'Hell Keep',
            E3M2: 'Slough of Despair',
            E3M3: 'Pandemonium',
            E3M4: 'House of Pain',
            E3M5: 'Unholy Cathedral',
            E3M6: 'Mt. Erebus',
            E3M7: 'Limbo',
            E3M8: 'Dis',
            E3M9: 'Warrens',
            E4M1: 'Hell Beneath',
            E4M2: 'Perfect Hatred',
            E4M3: 'Sever The Wicked',
            E4M4: 'Unruly Evil',
            E4M5: 'They Will Repent',
            E4M6: 'Against Thee Wickedly',
            E4M7: 'And Hell Followed',
            E4M8: 'Unto The Cruel',
            E4M9: 'Fear',
            MAP01: 'Entryway',
            MAP02: 'Underhalls',
            MAP03: 'The Gantlet',
            MAP04: 'The Focus',
            MAP05: 'The Waste Tunnels',
            MAP06: 'The Crusher',
            MAP07: 'Dead Simple',
            MAP08: 'Tricks and Traps',
            MAP09: 'The Pit',
            MAP10: 'Refueling Base',
            MAP11: '\'O\' of Destruction!',
            MAP12: 'The Factory',
            MAP13: 'Downtown',
            MAP14: 'The Inmost Dens',
            MAP15: 'Industrial Zone',
            MAP16: 'Suburbs',
            MAP17: 'Tenements',
            MAP18: 'The Courtyard',
            MAP19: 'The Citadel',
            MAP20: 'Gotcha!',
            MAP21: 'Nirvana',
            MAP22: 'The Catacombs',
            MAP23: 'Barrels o\' Fun',
            MAP24: 'The Chasm',
            MAP25: 'Bloodfalls',
            MAP26: 'The Abandoned Mines',
            MAP27: 'Monster Condo',
            MAP28: 'The Spirit World',
            MAP29: 'The Living End',
            MAP30: 'Icon of Sin',
            MAP31: 'Wolfenstein',
            MAP32: 'Grosse'
        };
    }
}
