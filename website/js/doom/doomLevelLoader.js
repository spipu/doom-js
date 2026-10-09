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
     * @param {object}   options - {skill: int, thingFilter: object, waterEffects: boolean (default false), onLevelExit: function(secret), turnEvents: DoomTurnEvents}
     * @returns {Promise<DoomBuiltLevel>}
     */
    async load(wadFile, levelCode, options) {
        const built = await new WadWorldBuilder(wadFile, levelCode, {
            onLevelExit:       options.onLevelExit,
            turnEvents:        options.turnEvents,
            thingCatalog:      this._thingCatalog,
            monsterCatalog:    this._monsterCatalog,
            skill:             options.skill,
            thingFilter:       options.thingFilter,
            waterEffects:      (options.waterEffects ?? false),
            profile:           this._profile
        }).build();

        const weaponSprites = new DoomWeaponSpriteBank(wadFile);
        this._itemCatalog.resolveAvailableWeapons(weaponSprites);
        const effectTemplates = new DoomEffectTemplates(weaponSprites, this._profile);
        // Skipped if the decal graphics are not decoded yet (first-level race).
        const decalTemplates = ((doomImageAssets.isReady()) ? new DoomDecalTemplates(doomImageAssets, this._profile) : null);
        // Not vanilla: a game with no splash of its own gets a generic one,
        // tinted with the colour of each liquid flat.
        if ((built.getTerrain() !== null) && doomImageAssets.isReady()) {
            new DoomGenericSplash(doomImageAssets, effectTemplates, this._profile).apply(built.getTerrain());
        }

        return built
            .setWeaponSprites(weaponSprites)
            .setEffectTemplates(effectTemplates)
            .setDecalTemplates(decalTemplates)
            .setProjectileDefs(DoomProjectileDefs.build(weaponSprites, this._profile));
    }
}
