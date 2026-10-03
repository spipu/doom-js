/**
 * WAD storage on the spipudoom database (DoomDatabaseSchema).
 *
 * Stores:
 *  - wad: {id, name, size, addedAt, source: {type: 'url'|'file', value}, sha256?, title?, version?, rank?, described?} — sha256 = identity
 *    of the file, title/version/rank = the known edition of the file (null when unknown, rank = release order within a title),
 *    described = the editions table version they were read with; all absent until computed
 *  - wadFile: {id, data: ArrayBuffer} — one-to-one with its wad
 *  - setting: {id, key, value} — persisted game settings (read by DoomSettings)
 *  - save: {id, wadId, slot, levelCode, skill, savedAt, formatVersion} — save slots (read by DoomSaveStore)
 *  - saveFile: {id, snapshot} — one-to-one with its save, only read on load
 */
class WadStorage {
    constructor() {
        this._database = new AppDatabase(DoomDatabaseSchema.build());
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
     * Stores a new WAD; its id is written on the metadata.
     *
     * @param {object}      meta
     * @param {ArrayBuffer} arrayBuffer
     */
    async saveWad(meta, arrayBuffer) {
        meta.id = await WadStorage._withStorageErrors(() => this._database.insert(DoomDatabaseSchema.WAD, meta, [
            {storeName: DoomDatabaseSchema.WAD_FILE, record: {data: arrayBuffer}}
        ]));
        WadStorage._askPersistence();
    }

    /**
     * The WAD and the changes to its saves in a single transaction.
     *
     * @param {object}      meta - a stored WAD's
     * @param {ArrayBuffer} arrayBuffer
     * @param {object[]}    rewrittenSaves - [{id, snapshot}]
     * @param {int[]}       removedSaveIds
     */
    async replaceWad(meta, arrayBuffer, rewrittenSaves, removedSaveIds) {
        await WadStorage._withStorageErrors(() => this._database.writeMulti([
            {storeName: DoomDatabaseSchema.WAD, record: meta},
            {storeName: DoomDatabaseSchema.WAD_FILE, record: {id: meta.id, data: arrayBuffer}},
            ...rewrittenSaves.map((save) => ({storeName: DoomDatabaseSchema.SAVE_FILE, record: save}))
        ], WadStorage._saveKeys(removedSaveIds)));
        WadStorage._askPersistence();
    }

    /**
     * @param {int} wadId
     * @returns {Promise<object[]>} [{meta, snapshot}] of the WAD's saves, in slot order
     */
    async readSaves(wadId) {
        const metas = (await this._savesOf(wadId)).sort((a, b) => (a.slot - b.slot));

        return Promise.all(metas.map(async (meta) => ({meta: meta, snapshot: (await this._database.get(DoomDatabaseSchema.SAVE_FILE, meta.id)).snapshot})));
    }

    /**
     * Rewrites the metadata of a stored WAD, its binary untouched. A WAD
     * deleted meanwhile stays deleted: no orphan metadata is written back.
     *
     * @param {object} meta
     * @returns {Promise<boolean>} false when the WAD no longer exists
     */
    async saveMeta(meta) {
        if ((await this._database.get(DoomDatabaseSchema.WAD, meta.id)) === null) {
            return false;
        }
        await this._database.put(DoomDatabaseSchema.WAD, meta);

        return true;
    }

    /**
     * Every metadata record, without reading the binaries.
     *
     * @returns {Promise<object[]>}
     */
    async listMeta() {
        return this._database.getAll(DoomDatabaseSchema.WAD);
    }

    /**
     * @param {int} id
     * @returns {Promise<{meta: object, data: ArrayBuffer}>}
     */
    async readWad(id) {
        const meta   = await this._database.get(DoomDatabaseSchema.WAD, id);
        const record = await this._database.get(DoomDatabaseSchema.WAD_FILE, id);
        if ((meta === null) || (record === null)) {
            throw new WadError('not-found', 'WAD not found: ' + id);
        }

        return {meta: meta, data: record.data};
    }

    /**
     * Deletes the WAD, its file and every save slot of it in a single
     * transaction: they disappear together or not at all.
     *
     * @param {int} id
     */
    async deleteWad(id) {
        const saveIds = (await this._savesOf(id)).map((meta) => meta.id);

        await this._database.deleteMulti([
            {storeName: DoomDatabaseSchema.WAD, key: id},
            {storeName: DoomDatabaseSchema.WAD_FILE, key: id},
            ...WadStorage._saveKeys(saveIds)
        ]);
    }

    async _savesOf(wadId) {
        return this._database.getAllByIndex(DoomDatabaseSchema.SAVE, DoomDatabaseSchema.SAVE_BY_WAD, wadId);
    }

    static _saveKeys(saveIds) {
        return saveIds.flatMap((saveId) => [
            {storeName: DoomDatabaseSchema.SAVE, key: saveId},
            {storeName: DoomDatabaseSchema.SAVE_FILE, key: saveId}
        ]);
    }

    static async _withStorageErrors(write) {
        try {
            return await write();
        } catch (error) {
            if (error && (error.name === 'QuotaExceededError')) {
                throw new WadError('quota-exceeded', 'Storage quota exceeded');
            }
            throw new WadError('storage-unavailable', 'Unable to save the WAD: ' + error.message);
        }
    }

    // Asked right after the user chose to store tens of megabytes; not
    // awaited, a permission prompt must not hold the screen back.
    static _askPersistence() {
        AppDatabase.requestPersistentStorage();
    }
}
