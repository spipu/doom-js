/**
 * Per-level sector damage (vanilla P_PlayerInSpecialSector): every 32-tic
 * window, a player standing ON the floor of a damage sector takes the
 * special's damage — 7 = 5, 5 = 10, 4/16 = 20 (the radiation suit cancels
 * 5/7 entirely and leaks 5/256 per window on 4/16), 11 = 20 with NO suit
 * protection plus a normal level exit once the player is down to 10 health
 * (the E1M8 finale). Damage goes through takeDamage, so armour absorption
 * and invulnerability apply as usual.
 */
class DoomSectorDamageInteraction extends AbstractInteraction {
    /**
     * @param {object[]}      zones        - [{si, outers (doom-coord polygons), floorY (world), special}]
     *                                       — includes the "+change" target sectors, whose
     *                                       special (and floor height) can mutate at runtime
     * @param {function|null} exitCallback - normal exit callback (special 11)
     */
    constructor(zones, exitCallback) {
        super();
        this._zones        = zones;
        this._exitCallback = exitCallback;
        this._windowS      = WadConstants.SECTOR_DAMAGE_WINDOW_TICS * WadConstants.SECONDS_PER_TIC;
        this._clockS       = 0;
        this._exited       = false;
    }

    get code() {
        return 'sectorDamage';
    }

    triggered(instance) {
    }

    update(dt) {
        this._clockS += dt / 1000;
        if (this._clockS < this._windowS) {
            return;
        }
        this._clockS %= this._windowS;

        const user = loader.world().get().getUser();
        if (user.isDead()) {
            return;
        }
        const zone = this._zoneUnderUser(user);
        if (zone === null) {
            return;
        }

        const damage = WadConstants.SECTOR_DAMAGE_BY_SPECIAL[zone.special];
        if (damage === undefined) {
            return;
        }
        if (zone.special === 11) {
            // E1M8 finale: the suit gives no protection, and reaching 10 health
            // ends the level through the normal exit (vanilla G_ExitLevel).
            user.takeDamage(damage);
            if (!this._exited && user.getEnergy() <= 10 && this._exitCallback !== null) {
                this._exited = true;
                this._exitCallback(false);
            }
            return;
        }
        if (user.hasEffect('radiation')
            && !(WadConstants.SECTOR_DAMAGE_LEAK_SPECIALS.has(zone.special) && (Math.random() * 256 < 5))) {
            return;
        }
        user.takeDamage(damage);
    }

    /**
     * "+change" support: a floor change rewrites the sector's special (0 =
     * harmless) and, the floor having moved, its height. No-op on a sector
     * absent from the zones (never damaging, before or after).
     */
    setSectorSpecial(si, special, floorY) {
        for (const zone of this._zones) {
            if (zone.si === si) {
                zone.special = special;
                zone.floorY  = floorY;
                return;
            }
        }
    }

    // Damage only applies with the feet ON the sector floor (an airborne or
    // riding player is safe, like vanilla's mo->z != floorheight check).
    _zoneUnderUser(user) {
        const doomX = user.x / WadConstants.SCALE;
        const doomZ = user.z / WadConstants.SCALE;
        for (const zone of this._zones) {
            if (Math.abs(user.y - zone.floorY) > 0.02) {
                continue;
            }
            for (const outer of zone.outers) {
                if (WadGeometry.pointInPolygon2d(doomX, doomZ, outer)) {
                    return zone;
                }
            }
        }

        return null;
    }
}
