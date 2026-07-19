/**
 * WAD storage on IndexedDB (spipudoom schema), built on the generic AppDatabase.
 *
 * Stores:
 *  - wadMeta: {id, name, size, addedAt, source: {type: 'url'|'file', value}}
 *  - wadData: {id, data: ArrayBuffer}
 *  - settings: {key, value} — persisted game settings (read by DoomSettings)
 */
class WadStorage {
    constructor() {
        this._database = new AppDatabase('spipudoom', 2, [
            {name: 'wadMeta', keyPath: 'id'},
            {name: 'wadData', keyPath: 'id'},
            {name: 'settings', keyPath: 'key'}
        ]);
    }

    async open() {
        try {
            await this._database.open();
        } catch (error) {
            throw new WadError('storage-unavailable', 'IndexedDB is not available: ' + error.message);
        }

        return this;
    }

    /**
     * The opened spipudoom database — shared with DoomSettings so the whole
     * app keeps a single connection and a single schema version.
     * @returns {AppDatabase}
     */
    getDatabase() {
        return this._database;
    }

    /**
     * Save metadata + binary content in a single transaction.
     *
     * @param {object}      meta
     * @param {ArrayBuffer} arrayBuffer
     */
    async saveWad(meta, arrayBuffer) {
        try {
            await this._database.putMulti([
                {storeName: 'wadMeta', record: meta},
                {storeName: 'wadData', record: {id: meta.id, data: arrayBuffer}}
            ]);
        } catch (error) {
            if (error && error.name === 'QuotaExceededError') {
                throw new WadError('quota-exceeded', 'Storage quota exceeded');
            }
            throw new WadError('storage-unavailable', 'Unable to save the WAD: ' + error.message);
        }
    }

    /**
     * List all metadata, without ever reading the binaries.
     *
     * @returns {Promise<object[]>}
     */
    async listMeta() {
        return this._database.getAll('wadMeta');
    }

    /**
     * @param {string} id
     * @returns {Promise<{meta: object, data: ArrayBuffer}>}
     */
    async readWad(id) {
        const meta = await this._database.get('wadMeta', id);
        const record = await this._database.get('wadData', id);

        if (meta === null || record === null) {
            throw new WadError('not-found', 'WAD not found: ' + id);
        }

        return {meta: meta, data: record.data};
    }

    /**
     * Delete metadata + binary content in a single transaction.
     *
     * @param {string} id
     */
    async deleteWad(id) {
        await this._database.deleteMulti([
            {storeName: 'wadMeta', key: id},
            {storeName: 'wadData', key: id}
        ]);
    }
}
