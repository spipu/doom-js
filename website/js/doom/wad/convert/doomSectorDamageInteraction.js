/**
 * Per-level sector damage (vanilla P_PlayerInSpecialSector): once per damage
 * window (32 tics for the Doom specials, 16 for the Heretic lavas), a player
 * standing ON the floor of a damage sector takes the special's damage. The
 * radiation suit cancels the damage up to the special's leak chance out of
 * 256 per window (0 = full protection, 5 = Doom super-damage, 256 = never
 * protects — Heretic lava). 11 = 20 with NO suit protection plus a normal
 * level exit once the player is down to 10 health (the E1M8 finale). Damage
 * goes through takeDamage, so armour absorption and invulnerability apply.
 */
class DoomSectorDamageInteraction extends AbstractInteraction {
    /**
     * @param {DoomSectorZones} zones        - [{si, floorY (world), special}] behind the
     *                                        shared locator — includes the "+change" target
     *                                        sectors, whose special (and floor height) can
     *                                        mutate at runtime
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
        this._exited       = false;
    }

    get code() {
        return 'sectorDamage';
    }

    // The zone mutations of setSectorSpecial ("+change" floors) are NOT
    // exported: they are replayed by the instances' lifecycle hooks when
    // their animation state is restored.
    exportState() {
        return {exited: this._exited};
    }

    importState(state) {
        this._exited = (state.exited === true);
    }

    triggered(instance) {
    }

    update(dt) {
        const wrapped = new Set();
        for (const windowTics of this._windowSizes) {
            const windowS = windowTics * WadConstants.SECONDS_PER_TIC;
            const clock   = (this._clockS[windowTics] ?? 0) + dt / 1000;
            this._clockS[windowTics] = clock % windowS;
            if (clock >= windowS) {
                wrapped.add(windowTics);
            }
        }
        if (wrapped.size === 0) {
            return;
        }

        const user = loader.world().get().getUser();
        if (user.isDead()) {
            return;
        }
        const zone = this._zoneUnderUser(user);
        if (zone === null) {
            return;
        }

        const entry = WadConstants.SECTOR_DAMAGE_BY_SPECIAL[zone.special];
        if ((entry === undefined) || !wrapped.has(entry.windowTics)) {
            return;
        }

        if (zone.special === 11) {
            // E1M8 finale: the suit gives no protection, and reaching 10 health
            // ends the level through the normal exit (vanilla G_ExitLevel).
            user.takeDamage(entry.damage);
            if (!this._exited && user.getEnergy() <= 10 && this._exitCallback !== null) {
                this._exited = true;
                this._exitCallback(false);
            }
            return;
        }
        if (user.hasEffect('radiation') && !(Math.random() * 256 < entry.leak)) {
            return;
        }
        user.takeDamage(entry.damage);
    }

    /**
     * "+change" support: a floor change rewrites the sector's special (0 =
     * harmless) and, the floor having moved, its height. No-op on a sector
     * absent from the zones (never damaging, before or after).
     */
    setSectorSpecial(si, special, floorY) {
        const zone = this._zones.bySi(si);
        if (zone !== null) {
            zone.special = special;
            zone.floorY  = floorY;
        }
    }

    // Damage only applies with the feet ON the sector floor (an airborne or
    // riding player is safe, like vanilla's mo->z != floorheight check).
    _zoneUnderUser(user) {
        return this._zones.zoneAt(user.x / WadConstants.SCALE, user.z / WadConstants.SCALE,
            (zone) => (Math.abs(user.y - zone.floorY) <= WadConstants.ON_FLOOR_TOLERANCE));
    }
}
