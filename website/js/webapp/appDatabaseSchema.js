/**
 * The versions of a database schema, each with its upgrade from the previous
 * one. An open runs every step from the stored version up to the last inside
 * the exclusive upgrade transaction; a fresh database goes through the whole chain.
 */
class AppDatabaseSchema {
    /** @type {string}     */ _name;
    /** @type {function[]} */ _upgrades;

    /**
     * @param {string} name - the database name
     */
    constructor(name) {
        this._name     = name;
        this._upgrades = [];
    }

    getName() {
        return this._name;
    }

    getVersion() {
        return this._upgrades.length;
    }

    /**
     * @param {int}                                       version - the next one, from 1
     * @param {function(AppDatabaseUpgrade): (Promise|void)} upgrade
     */
    addVersion(version, upgrade) {
        if (version !== (this._upgrades.length + 1)) {
            throw new Error('AppDatabaseSchema [' + this._name + '] - version ' + version + ' declared after ' + this._upgrades.length);
        }
        this._upgrades.push(upgrade);

        return this;
    }

    /**
     * @param {AppDatabaseUpgrade} upgrade
     * @param {int}                fromVersion - the stored one, 0 for a new database
     */
    async upgrade(upgrade, fromVersion) {
        for (let version = (fromVersion + 1); version <= this.getVersion(); version++) {
            await this._upgrades[version - 1](upgrade);
        }
    }
}
