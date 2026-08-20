/**
 * Persistence of the save slots (spipudoom database, stores saveMeta/saveData).
 *
 * Saves are partitioned by WAD and limited to MAX_SLOTS slots each; the
 * WAD+slot unicity is carried by the primary key itself (saveId). The light
 * metadata lives apart from the snapshot so listing the slots never
 * deserializes a full game state. Snapshots must stay pure JSON-safe data.
 */
class DoomSaveStore {
    static MAX_SLOTS      = 5;
    static FORMAT_VERSION = 2;

    constructor() {
        this._database = null;
    }

    static saveId(wadId, slot) {
        return wadId + ':' + slot;
    }

    /**
     * @param {AppDatabase} database - the opened spipudoom database
     */
    init(database) {
        this._database = database;

        return this;
    }

    /**
     * Metadata of every used slot of a WAD, keyed by slot number.
     *
     * @param {string} wadId
     * @returns {Promise<Object<number, object>>}
     */
    async list(wadId) {
        const rows = await this._database.getAll('saveMeta');
        const slots = Object.create(null);
        for (const meta of rows) {
            if (meta.wadId === wadId) {
                slots[meta.slot] = meta;
            }
        }

        return slots;
    }

    /**
     * @param {string} wadId
     * @param {number} slot
     * @returns {Promise<{meta: object, snapshot: object}>}
     */
    async read(wadId, slot) {
        const id = DoomSaveStore.saveId(wadId, slot);
        const meta = await this._database.get('saveMeta', id);
        const record = await this._database.get('saveData', id);

        if ((meta === null) || (record === null)) {
            throw new Error('Save not found: ' + id);
        }

        return {meta: meta, snapshot: record.snapshot};
    }

    /**
     * Write metadata + snapshot in a single transaction; an existing slot is
     * replaced (the caller confirms the overwrite beforehand).
     *
     * @param {object} meta - {id, wadId, slot, levelCode, skill, savedAt, formatVersion}
     * @param {object} snapshot
     */
    async write(meta, snapshot) {
        await this._database.putMulti([
            {storeName: 'saveMeta', record: meta},
            {storeName: 'saveData', record: {id: meta.id, snapshot: snapshot}}
        ]);
    }

    /**
     * @param {string} wadId
     * @param {number} slot
     */
    async remove(wadId, slot) {
        const id = DoomSaveStore.saveId(wadId, slot);
        await this._database.deleteMulti([
            {storeName: 'saveMeta', key: id},
            {storeName: 'saveData', key: id}
        ]);
    }
}

const doomSaveStore = new DoomSaveStore();
