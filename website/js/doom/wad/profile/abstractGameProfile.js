/**
 * Per-game policy of the WAD converter — the pure contract. The binary map
 * format is identical across Doom-engine games, but the SEMANTICS (thing
 * types, linedef/sector specials, level progression, animation sequences,
 * switch pairs, sky, assets) live in the game executable — so they live in a
 * profile per game. NOTHING game-specific may exist outside the profiles.
 *
 * Hierarchy: DefaultGameProfile carries the generic doom-format behaviour
 * (the WadConstants tables ARE that baseline) and is the fallback for any
 * unrecognized WAD; every game profile (doom, freedoom, heretic…) extends it
 * and overrides only its divergences. The right profile for a WAD is picked
 * by GameProfileList.getForWad, which asks every registered profile
 * matchesWad (GZDoom iwadinfo approach: each game is recognized by lumps
 * only it carries).
 */
class AbstractGameProfile {
    /**
     * Identifier of the game this profile implements.
     *
     * @returns {string} e.g. 'default', 'doom', 'heretic'
     */
    getCode() {
        this._generateException('getCode must be implemented');
        return '';
    }

    /**
     * True when the WAD content identifies this profile's game. The fallback
     * profile (default) is never probed — it answers for any unmatched WAD.
     *
     * @param {WadFile} wadFile
     * @returns {boolean}
     */
    matchesWad(wadFile) {
        return false;
    }

    /**
     * Linedef special remaps (WAD number → internal WadConstants code).
     * Only the divergent ones; every absent special is identity, 0 = dropped.
     *
     * @returns {object}
     */
    linedefSpecialMap() {
        return {};
    }

    /**
     * Sector special remaps (WAD number → internal WadConstants code).
     * Identity when absent, 0 = dropped.
     *
     * @returns {object}
     */
    sectorSpecialMap() {
        return {};
    }

    /**
     * Game-specific entries merged into the WadConstants baseline tables
     * before each level build (WadConstants.applyGameExtensions). Every entry
     * lives in the >= 1000 namespace and is only reachable through this
     * profile's own special maps. Table name → entries (object or array for
     * a Set). The baseline needs none.
     *
     * @returns {object}
     */
    wadConstantsExtensions() {
        return {};
    }

    /**
     * Level progression data (WadMapInfo synthesizes the per-level chain from
     * these rules applied to the level name patterns; UMAPINFO overlays it).
     *
     * @returns {{episodeSecretReturns: object, mapSecretSlot: string, mapSuperSecretSlot: string, mapSecretReturn: string}}
     */
    progressionRules() {
        this._generateException('progressionRules must be implemented');
        return {};
    }

    /**
     * Display names of the game's episodes, keyed by the episode's first map
     * slot (uppercase). The names are proper nouns, never translated — like
     * the level names. An episode present in the WAD but absent from this
     * table only shows its number ("Episode 6").
     *
     * @returns {object} first level name → episode name
     */
    episodeNames() {
        this._generateException('episodeNames must be implemented');
        return {};
    }

    /**
     * RGB tint of the BFG lightning decal (the WAD art shades differ).
     *
     * @returns {number[]}
     */
    bfgDecalShade() {
        this._generateException('bfgDecalShade must be implemented');
        return [];
    }

    /**
     * Catalog mapping the THING editor numbers of this game to world
     * descriptors — generic assembly: the resolver is the shared
     * DoomThingCatalog, only the data (thingDecorations / thingTypes) is
     * per-game.
     *
     * @returns {DoomThingCatalog}
     */
    createThingCatalog() {
        return new DoomThingCatalog(this.thingDecorations(), this.thingTypes());
    }

    /**
     * Assemble the game's monster catalog. Generic here: the mechanics are in
     * DoomMonsterCatalog, only the data (monsterDefs) is per-game.
     *
     * @returns {DoomMonsterCatalog}
     */
    createMonsterCatalog() {
        return new DoomMonsterCatalog(this.monsterDefs());
    }

    /**
     * Monster definitions of this game, transcribed from the UZDoom zscript
     * actors (stats, state machine, flags, drops).
     *
     * @returns {object} editor number → DoomMonsterDef
     */
    monsterDefs() {
        this._generateException('monsterDefs must be implemented');
        return {};
    }

    /**
     * Map actions fired when the last boss of a type dies (vanilla
     * A_BossDeath). Keyed by the same codes the monster defs carry in their
     * bossMaps ('E1M8', or 'MAP07-1'/'MAP07-2' when one map hosts two boss
     * groups — the level name is key.split('-')[0]). Value: {special, tag}
     * (internal special codes, same vocabulary as the mover tables) or
     * {exit: true}.
     *
     * @returns {object} boss-map code → action
     */
    bossActions() {
        return {};
    }

    /**
     * Per-game numbers of the shootable-body damage pipeline (gib threshold,
     * default kickback, blood behaviour) — UZDoom gameinfo + P_SpawnBlood.
     *
     * @returns {object} {gibFactor, defKickback, bloodTemplate, bloodDamageAdvance}
     */
    monsterDamageRules() {
        this._generateException('monsterDamageRules must be implemented');
        return {};
    }

    /**
     * Sprite lump a corpse ground by a mover turns into (the vanilla S_GIBS
     * pool, UZDoom Actor::Grind → GenericCrush). null = this game has none
     * and a crushed corpse keeps its own sprite.
     *
     * @returns {string|null}
     */
    crushedCorpseSprite() {
        return null;
    }

    /**
     * Pickup templates of the monsters' DropItems: zscript item name →
     * {sprite, effect} (fixed effect) or {sprite, ammoType} (the amount comes
     * from each monster's dropItems entry).
     *
     * @returns {object} name → {sprite, effect?|ammoType?}
     */
    dropItemTypes() {
        this._generateException('dropItemTypes must be implemented');
        return {};
    }

    /**
     * Decoration definitions of this game's things.
     *
     * @returns {object} code → DoomDecoration
     */
    thingDecorations() {
        this._generateException('thingDecorations must be implemented');
        return {};
    }

    /**
     * THING editor-number table of this game.
     *
     * @returns {object} editor number → {kind, sprite|code, frames?, animDuration?, solid?, effect?}
     */
    thingTypes() {
        this._generateException('thingTypes must be implemented');
        return {};
    }

    /**
     * Per-skill gameplay rules, transcribed from the game's UZDoom MAPINFO
     * skill blocks. Skill 0 is our own "Labyrinth but no monster" mode: the
     * skill-1 world (spawn filter, ammo, damage) with monsters disabled.
     *
     * @returns {object} skill (0-5) → {spawnFilterBit, ammoFactor, damageFactor,
     *                   monstersEnabled, fastMonsters, instantReaction,
     *                   respawnTicsDelay, easyBossBrain}
     */
    skillRules() {
        this._generateException('skillRules must be implemented');
        return {};
    }

    /**
     * gameinfo nightmarefast: under the fastMonsters skill, EVERY monster's
     * chase cadence halves at runtime (Heretic true; Doom relies on its Fast
     * states only — demon/spectre).
     *
     * @returns {boolean}
     */
    nightmareFast() {
        return false;
    }

    /**
     * @returns {object} code → DoomAmmo definition
     */
    buildAmmoTypes() {
        this._generateException('buildAmmoTypes must be implemented');
        return {};
    }

    /**
     * @returns {object} code → DoomWeapon definition (empty when the game's
     *                   arsenal is not implemented yet)
     */
    buildWeapons() {
        this._generateException('buildWeapons must be implemented');
        return {};
    }

    /**
     * @returns {object} code → DoomItem definition (keys, power-ups)
     */
    buildItems() {
        this._generateException('buildItems must be implemented');
        return {};
    }

    /**
     * Starting player loadout of a fresh game.
     *
     * @returns {{weapons: string[], activeWeapon: string|null, ammo: object, maxArmor: number}}
     */
    startingLoadout() {
        this._generateException('startingLoadout must be implemented');
        return {};
    }

    /**
     * ARMS panel layout: number of slots, weapon → slot mapping, the
     * always-lit slot and its upgrade weapon (accent border when owned).
     *
     * @returns {{count: number, byWeapon: object, alwaysOwnedSlot: number, upgradeWeapon: string}}
     */
    hudWeaponSlots() {
        this._generateException('hudWeaponSlots must be implemented');
        return {};
    }

    /**
     * Key item code → HUD dot color.
     *
     * @returns {object}
     */
    hudKeyColors() {
        this._generateException('hudKeyColors must be implemented');
        return {};
    }

    /**
     * Hardcoded texture/flat animation sequences of this game's engine, used
     * when the WAD carries no ANIMATED lump (the lump always wins).
     *
     * @returns {object[]} [{isFlat, frames, speedTics}]
     */
    vanillaAnimSequences() {
        this._generateException('vanillaAnimSequences must be implemented');
        return [];
    }

    /**
     * Switch texture pairs hardcoded in this game's engine, used when the WAD
     * carries no SWITCHES lump (the lump always wins). Each pair is
     * registered in both directions.
     *
     * @returns {string[][]} [[offName, onName], …]
     */
    switchPairs() {
        this._generateException('switchPairs must be implemented');
        return [];
    }

    /**
     * Sky texture + horizontal wrap for a level.
     *
     * @param {string} levelName
     * @returns {{name: string, wrap: number}}
     */
    skyForLevel(levelName) {
        this._generateException('skyForLevel must be implemented');
        return {};
    }

    /**
     * External decal graphics of this game (loaded once at app startup, for
     * every registered profile — keys must be unique across games).
     *
     * @returns {{basePath: string, keys: string[]}}
     */
    decalAssets() {
        this._generateException('decalAssets must be implemented');
        return {};
    }

    /**
     * Impact decal templates (decaldef data): per type, the graphics keys and
     * their scale/shade/translucency/gain — shade 'bfg' resolves to
     * bfgDecalShade(). fade marks the fading (GoAway2) templates.
     *
     * @returns {object[]}
     */
    decalTemplates() {
        this._generateException('decalTemplates must be implemented');
        return [];
    }

    /**
     * Transient weapon effect templates (hitscan puffs, projectile
     * explosions/impacts): short sprite animations built once per level in
     * the load batch. rise is the upward drift in map units/tic (0 = static);
     * meleeStart is the frame index a melee hit starts the puff at.
     *
     * @returns {object[]} [{name, sprite, letters, frameTics, alpha, rise, additive, meleeStart?}]
     */
    weaponEffectTemplates() {
        this._generateException('weaponEffectTemplates must be implemented');
        return [];
    }

    /**
     * Projectile definitions: in-flight sprite frames, speed (map units/tic),
     * in-flight alpha, death effect template, wall decal. Optional: gravity
     * (map units/tic², applied after gravityDelayTics of straight flight,
     * with the horizontal speed rescaled to dropSpeed and the vertical speed
     * halved at dropoff) and trailEffect (template spawned every
     * trailEveryTics of flight — set the two together).
     *
     * @returns {object[]} [{kind, sprite, letters, speed, flightTics, explosion, splashDamage, alpha, additive, decalType, gravity?, gravityDelayTics?, dropSpeed?, trailEffect?, trailEveryTics?}]
     */
    projectileDefs() {
        this._generateException('projectileDefs must be implemented');
        return [];
    }

    /**
     * Weapon preference order when the current weapon runs dry
     * (P_CheckAmmo): the first owned entry with enough ammo wins. min
     * overrides the ammo threshold (default = the weapon's perShot); the
     * last entry is the unconditional fallback.
     *
     * @returns {object[]} [{code, min?}]
     */
    weaponFallbackOrder() {
        this._generateException('weaponFallbackOrder must be implemented');
        return [];
    }

    /**
     * Armour granted by the full-kit test cheat — the best armour class of
     * this game.
     *
     * @returns {{points: number, absorb: number}}
     */
    cheatKitArmor() {
        this._generateException('cheatKitArmor must be implemented');
        return {};
    }

    _generateException(msg) {
        throw new Error('GameProfile - ' + msg);
    }
}
