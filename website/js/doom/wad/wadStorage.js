/**
 * WAD storage on IndexedDB (spipudoom schema), built on the generic AppDatabase.
 *
 * Stores:
 *  - wadMeta: {id, name, size, addedAt, source: {type: 'url'|'file', value}, sha256?, title?, version?, rank?, described?} — sha256 = identity
 *    of the file, title/version/rank = the known edition of the file (null when unknown, rank = release order within a title), described = the editions table version they were read with;
 *    all absent until computed
 *  - wadData: {id, data: ArrayBuffer}
 *  - settings: {key, value} — persisted game settings (read by DoomSettings)
 *  - saveMeta: {id, wadId, slot, levelCode, skill, savedAt, formatVersion} — save slots (read by DoomSaveStore)
 *  - saveData: {id, snapshot} — full game snapshot of a slot, only read on load
 */
class WadStorage {
    constructor() {
        this._database = new AppDatabase('spipudoom', 3, [
            {name: 'wadMeta', keyPath: 'id'},
            {name: 'wadData', keyPath: 'id'},
            {name: 'settings', keyPath: 'key'},
            {name: 'saveMeta', keyPath: 'id'},
            {name: 'saveData', keyPath: 'id'}
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
        await this.replaceWad(meta, arrayBuffer, [], []);
    }

    /**
     * The WAD and the changes to its saves in a single transaction.
     *
     * @param {object}      meta
     * @param {ArrayBuffer} arrayBuffer
     * @param {object[]}    rewrittenSaves - [{id, snapshot}]
     * @param {string[]}    removedSaveIds
     */
    async replaceWad(meta, arrayBuffer, rewrittenSaves, removedSaveIds) {
        try {
            await this._database.writeMulti([
                {storeName: 'wadMeta', record: meta},
                {storeName: 'wadData', record: {id: meta.id, data: arrayBuffer}},
                ...rewrittenSaves.map((save) => ({storeName: 'saveData', record: save}))
            ], WadStorage._saveKeys(removedSaveIds));
        } catch (error) {
            if (error && (error.name === 'QuotaExceededError')) {
                throw new WadError('quota-exceeded', 'Storage quota exceeded');
            }
            throw new WadError('storage-unavailable', 'Unable to save the WAD: ' + error.message);
        }

        // Asked right after the user chose to store tens of megabytes; not
        // awaited, a permission prompt must not hold the screen back.
        AppDatabase.requestPersistentStorage();
    }

    /**
     * @param {string} wadId
     * @returns {Promise<object[]>} [{meta, snapshot}] of the WAD's saves, in slot order
     */
    async readSaves(wadId) {
        const metas = (await this._saveMetasOf(wadId)).sort((a, b) => (a.slot - b.slot));

        return Promise.all(metas.map(async (meta) => ({meta: meta, snapshot: (await this._database.get('saveData', meta.id)).snapshot})));
    }

    /**
     * Rewrites the metadata of a stored WAD, its binary untouched. A WAD
     * deleted meanwhile stays deleted: no orphan metadata is written back.
     *
     * @param {object} meta
     * @returns {Promise<boolean>} false when the WAD no longer exists
     */
    async saveMeta(meta) {
        if ((await this._database.get('wadMeta', meta.id)) === null) {
            return false;
        }
        await this._database.put('wadMeta', meta);

        return true;
    }

    /**
     * Every metadata record, without reading the binaries.
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

        if ((meta === null) || (record === null)) {
            throw new WadError('not-found', 'WAD not found: ' + id);
        }

        return {meta: meta, data: record.data};
    }

    /**
     * Delete metadata + binary content + every save slot of the WAD, in a
     * single transaction (the WAD and its saves disappear together or not at all).
     *
     * @param {string} id
     */
    async deleteWad(id) {
        const saveIds = (await this._saveMetasOf(id)).map((meta) => meta.id);

        await this._database.deleteMulti([
            {storeName: 'wadMeta', key: id},
            {storeName: 'wadData', key: id},
            ...WadStorage._saveKeys(saveIds)
        ]);
    }

    async _saveMetasOf(wadId) {
        return (await this._database.getAll('saveMeta')).filter((meta) => (meta.wadId === wadId));
    }

    static _saveKeys(saveIds) {
        return saveIds.flatMap((saveId) => [{storeName: 'saveMeta', key: saveId}, {storeName: 'saveData', key: saveId}]);
    }
}
