/**
 * The level build every device runs, with or without a simulation: the world
 * builder, then the visual banks the level shows — weapon sprites, effect and
 * decal templates, generic splash, projectile flights. Runs inside the loader
 * batch the caller opened: nothing registers at runtime. The simulating device
 * adopts the returned level in the same batch.
 */
class DoomLevelLoader {
    /**
     * @param {AbstractGameProfile} profile
     * @param {DoomThingCatalog}    thingCatalog
     * @param {DoomMonsterCatalog}  monsterCatalog
     * @param {DoomItemCatalog}     itemCatalog - learns which weapons the WAD draws
     */
    constructor(profile, thingCatalog, monsterCatalog, itemCatalog) {
        this._profile        = profile;
        this._thingCatalog   = thingCatalog;
        this._monsterCatalog = monsterCatalog;
        this._itemCatalog    = itemCatalog;
    }

    /**
     * @param {WadFile}  wadFile
     * @param {string}   levelCode
     * @param {object}   options - {skill: int, multiplayerThings: boolean, onLevelExit: function(secret)}
     * @returns {Promise<DoomBuiltLevel>}
     */
    async load(wadFile, levelCode, options) {
        const built = await new WadWorldBuilder(wadFile, levelCode, {
            onLevelExit:       options.onLevelExit,
            thingCatalog:      this._thingCatalog,
            monsterCatalog:    this._monsterCatalog,
            skill:             options.skill,
            multiplayerThings: options.multiplayerThings,
            profile:           this._profile
        }).build();

        const weaponSprites = new DoomWeaponSpriteBank(wadFile);
        this._itemCatalog.resolveAvailableWeapons(weaponSprites);
        const effects = new DoomEffects(weaponSprites, this._profile);
        // Skipped if the decal graphics are not decoded yet (first-level race).
        const decals = ((doomImageAssets.isReady()) ? new DoomDecals(doomImageAssets, this._profile) : null);
        // Not vanilla: a game with no splash of its own gets a generic one,
        // tinted with the colour of each liquid flat.
        if ((built.getTerrain() !== null) && doomImageAssets.isReady()) {
            new DoomGenericSplash(doomImageAssets, effects, this._profile).apply(built.getTerrain());
        }

        return built
            .setWeaponSprites(weaponSprites)
            .setEffects(effects)
            .setDecals(decals)
            .setProjectileDefs(DoomProjectileDefs.build(weaponSprites, this._profile));
    }
}
