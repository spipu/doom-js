/**
 * Per-level sector damage (vanilla P_PlayerInSpecialSector): once per damage
 * window (32 tics for the Doom specials, 16 for the Heretic lavas), a player
 * standing ON the floor of a damage sector takes the special's damage. The
 * radiation suit cancels the damage up to the special's leak chance out of
 * 256 per window (0 = full protection, 5 = Doom super-damage, 256 = never
 * protects — Heretic lava, the E1M8 finale). The exit special also ends the
 * level through the normal exit once the player is down to the exit health,
 * tested every frame like the vanilla per-tic check. Damage goes through
 * takeDamage, so armour absorption and invulnerability apply.
 */
class DoomSectorDamageInteraction extends AbstractInteraction {
    /**
     * @param {DoomSectorZones} zones        - [{si, special}] behind the shared locator —
     *                                        includes the "+change" target sectors, whose
     *                                        special mutates at runtime
     * @param {function|null}   exitCallback - normal exit callback (special 11)
     */
    constructor(zones, exitCallback) {
        super();
        this._zones        = zones;
        this._exitCallback = exitCallback;
        // One free-running clock per distinct window size (the vanilla
        // leveltime masks): damage only lands on a boundary crossing, never
        // on zone entry — walking through fast enough costs nothing. Sizes
        // are read at construction, after the game profile extensions landed.
        this._clockS       = {};
        this._windowSizes  = [...new Set(Object.values(WadConstants.SECTOR_DAMAGE_BY_SPECIAL).map((e) => e.windowTics))];
    }

    get code() {
        return 'sectorDamage';
    }

    triggered(instance) {
    }

    update(dt) {
        const wrapped = this._advanceClocks(dt);
        const user = loader.world().get().getUser();
        if (user.isDead() || !this._needsZone(wrapped, user)) {
            return;
        }
        const zone = this._zoneUnderUser(user);
        if (zone === null) {
            return;
        }

        const entry = WadConstants.SECTOR_DAMAGE_BY_SPECIAL[zone.special];
        if ((entry !== undefined) && wrapped.has(entry.windowTics) && !this._suitProtects(user, entry)) {
            user.takeDamage(entry.damage);
        }
        if (zone.special === WadConstants.SECTOR_DAMAGE_EXIT_SPECIAL) {
            this._exitWhenDown(user);
        }
    }

    // "+change" support: a floor change rewrites the sector's special (0 =
    // harmless). No-op on a sector absent from the zones (never damaging,
    // before or after).
    setSectorSpecial(si, special) {
        const zone = this._zones.bySi(si);
        if (zone !== null) {
            zone.special = special;
        }
    }

    // Whether the point (world coordinates) lies in an exit sector, whatever
    // the height — the sector test of P_DamageMobj, not the feet-on-floor gate.
    isExitSectorAt(worldX, worldZ) {
        let found = false;
        this._zones.eachZoneAt(worldX, worldZ, (zone) => {
            found = (found || (zone.special === WadConstants.SECTOR_DAMAGE_EXIT_SPECIAL));
        });

        return found;
    }

    _advanceClocks(dt) {
        const wrapped = new Set();
        for (const windowTics of this._windowSizes) {
            const windowS = windowTics * WadConstants.SECONDS_PER_TIC;
            const clock   = (this._clockS[windowTics] ?? 0) + dt / 1000;
            this._clockS[windowTics] = clock % windowS;
            if (clock >= windowS) {
                wrapped.add(windowTics);
            }
        }

        return wrapped;
    }

    // Off a window boundary, the sector lookup only serves the exit test.
    _needsZone(wrapped, user) {
        return ((wrapped.size > 0) || ((this._exitCallback !== null) && (user.getEnergy() <= WadConstants.SECTOR_DAMAGE_EXIT_HEALTH)));
    }

    _suitProtects(user, entry) {
        return (user.hasEffect('radiation') && !(Math.random() * 256 < entry.leak));
    }

    // P_PlayerInSpecialSector case 11 → G_ExitLevel.
    _exitWhenDown(user) {
        if ((user.getEnergy() <= WadConstants.SECTOR_DAMAGE_EXIT_HEALTH) && (this._exitCallback !== null)) {
            this._exitCallback(false);
        }
    }

    // Damage only applies with the feet ON the sector floor (an airborne or
    // riding player is safe, like vanilla's mo->z != floorheight check).
    _zoneUnderUser(user) {
        return this._zones.zoneUnderFeet(user.x, user.y, user.z);
    }
}
