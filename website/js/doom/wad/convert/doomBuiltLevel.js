/**
 * What the world builder hands to the game besides the engine objects: the
 * level services (sector light, damage and surfaces, terrain, automap, mover
 * and ambient sounds, shot-activated lines), the level totals and the player
 * starts. Handed back rather than pushed into the simulation, so that a level
 * can be built without one.
 */
class DoomBuiltLevel {
    constructor() {
        this._gunTriggers    = null;
        this._sectorDamage   = null;   // null when no sector hurts
        this._sectorLight    = null;
        this._sectorSurfaces = null;
        this._terrain        = null;
        this._moverSounds    = null;
        this._ambientSounds  = null;   // null when the level has no ambient thing
        this._automap        = null;   // null when the WAD has no usable BSP
        this._secretsTotal   = 0;
        this._killsTotal     = 0;
        this._itemsTotal     = 0;
        this._playerStarts   = {};     // slot → {x, y, z, yaw}
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
}
