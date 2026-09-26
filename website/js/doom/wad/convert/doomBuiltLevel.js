/**
 * The level every device builds, besides the engine objects: the level
 * services (sector light, damage and surfaces, terrain, automap, mover and
 * ambient sounds, shot-activated lines), the visual banks (weapon sprites,
 * effect and decal templates, projectile flights), the totals and the player
 * starts, and in plain data what only the simulating device wires — the monster
 * placements and their level data, the bodies born in play, the drop templates,
 * the boss rules, and the pickup, teleport, push and secret interactions it
 * registers. Handed back rather than pushed into the simulation, so that a
 * device that only displays the level builds the same one.
 */
class DoomBuiltLevel {
    constructor() {
        this._gunTriggers       = null;
        this._sectorDamage      = null;   // null when no sector hurts
        this._sectorLight       = null;
        this._sectorSurfaces    = null;
        this._terrain           = null;
        this._moverSounds       = null;
        this._ambientSounds     = null;   // null when the level has no ambient thing
        this._automap           = null;   // null when the WAD has no usable BSP
        this._secretsTotal      = 0;
        this._killsTotal        = 0;
        this._itemsTotal        = 0;
        this._playerStarts      = {};     // slot → {x, y, z, yaw}
        this._monsterPlacements = [];     // monster records as DoomMonsterSystem.add takes them, in map order
        this._monsterLevelData  = null;   // sector graph, REJECT, mover codes, monster lines, spots, live heights
        this._monsterSpawnables = {};     // def code → {def, frames}: the bodies born in play
        this._dropTemplates     = [];     // {key, code, objId, effect} per item/amount pair
        this._crushedCorpseView = null;   // null when the game has no gib pool
        this._bossBrain         = null;   // DoomBossBrain on an Icon of Sin level
        this._bossRules         = [];     // A_BossDeath rules of the level
        this._pickups           = [];     // {code, effect, countsItem} of the map pickups
        this._teleports         = [];     // {code, destination} of the teleport lines
        this._pushZones         = null;   // null when no sector pushes
        this._secretZones       = null;   // null when the level has no secret
        this._weaponSprites     = null;
        this._effects           = null;
        this._decals            = null;   // null while the decal graphics are not decoded
        this._projectileDefs    = {};     // kind → flight (DoomProjectileDefs)
    }

    setGunTriggers(gunTriggers) {
        this._gunTriggers = gunTriggers;

        return this;
    }

    getGunTriggers() {
        return this._gunTriggers;
    }

    setSectorDamage(sectorDamage) {
        this._sectorDamage = sectorDamage;

        return this;
    }

    getSectorDamage() {
        return this._sectorDamage;
    }

    setSectorLight(sectorLight) {
        this._sectorLight = sectorLight;

        return this;
    }

    getSectorLight() {
        return this._sectorLight;
    }

    setSectorSurfaces(sectorSurfaces) {
        this._sectorSurfaces = sectorSurfaces;

        return this;
    }

    getSectorSurfaces() {
        return this._sectorSurfaces;
    }

    setTerrain(terrain) {
        this._terrain = terrain;

        return this;
    }

    getTerrain() {
        return this._terrain;
    }

    setMoverSounds(moverSounds) {
        this._moverSounds = moverSounds;

        return this;
    }

    getMoverSounds() {
        return this._moverSounds;
    }

    setAmbientSounds(ambientSounds) {
        this._ambientSounds = ambientSounds;

        return this;
    }

    getAmbientSounds() {
        return this._ambientSounds;
    }

    setAutomap(automap) {
        this._automap = automap;

        return this;
    }

    getAutomap() {
        return this._automap;
    }

    setSecretsTotal(total) {
        this._secretsTotal = total;

        return this;
    }

    getSecretsTotal() {
        return this._secretsTotal;
    }

    setKillsTotal(total) {
        this._killsTotal = total;

        return this;
    }

    getKillsTotal() {
        return this._killsTotal;
    }

    // The vanilla MF_COUNTITEM bonuses and power-ups.
    setItemsTotal(total) {
        this._itemsTotal = total;

        return this;
    }

    getItemsTotal() {
        return this._itemsTotal;
    }

    setPlayerStarts(playerStarts) {
        this._playerStarts = playerStarts;

        return this;
    }

    getPlayerStarts() {
        return this._playerStarts;
    }

    setMonsterPlacements(monsterPlacements) {
        this._monsterPlacements = monsterPlacements;

        return this;
    }

    getMonsterPlacements() {
        return this._monsterPlacements;
    }

    setMonsterLevelData(monsterLevelData) {
        this._monsterLevelData = monsterLevelData;

        return this;
    }

    getMonsterLevelData() {
        return this._monsterLevelData;
    }

    setMonsterSpawnables(monsterSpawnables) {
        this._monsterSpawnables = monsterSpawnables;

        return this;
    }

    getMonsterSpawnables() {
        return this._monsterSpawnables;
    }

    setDropTemplates(dropTemplates) {
        this._dropTemplates = dropTemplates;

        return this;
    }

    getDropTemplates() {
        return this._dropTemplates;
    }

    setCrushedCorpseView(crushedCorpseView) {
        this._crushedCorpseView = crushedCorpseView;

        return this;
    }

    getCrushedCorpseView() {
        return this._crushedCorpseView;
    }

    setBossBrain(bossBrain) {
        this._bossBrain = bossBrain;

        return this;
    }

    getBossBrain() {
        return this._bossBrain;
    }

    setBossRules(bossRules) {
        this._bossRules = bossRules;

        return this;
    }

    getBossRules() {
        return this._bossRules;
    }

    setPickups(pickups) {
        this._pickups = pickups;

        return this;
    }

    getPickups() {
        return this._pickups;
    }

    setTeleports(teleports) {
        this._teleports = teleports;

        return this;
    }

    getTeleports() {
        return this._teleports;
    }

    setPushZones(pushZones) {
        this._pushZones = pushZones;

        return this;
    }

    getPushZones() {
        return this._pushZones;
    }

    setSecretZones(secretZones) {
        this._secretZones = secretZones;

        return this;
    }

    getSecretZones() {
        return this._secretZones;
    }

    setWeaponSprites(weaponSprites) {
        this._weaponSprites = weaponSprites;

        return this;
    }

    getWeaponSprites() {
        return this._weaponSprites;
    }

    setEffects(effects) {
        this._effects = effects;

        return this;
    }

    getEffects() {
        return this._effects;
    }

    setDecals(decals) {
        this._decals = decals;

        return this;
    }

    getDecals() {
        return this._decals;
    }

    setProjectileDefs(projectileDefs) {
        this._projectileDefs = projectileDefs;

        return this;
    }

    getProjectileDefs() {
        return this._projectileDefs;
    }
}
