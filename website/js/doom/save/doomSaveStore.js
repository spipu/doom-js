/**
 * Persistence of the save slots (spipudoom database, stores save/saveFile).
 *
 * Saves are partitioned by WAD and limited to MAX_SLOTS slots each; a unique
 * index keeps one save per WAD and slot. The light metadata lives apart from
 * the snapshot so listing the slots never deserializes a full game state.
 * Snapshots must stay pure JSON-safe data.
 */
class DoomSaveStore {
    static MAX_SLOTS      = 5;
    static FORMAT_VERSION = 2;

    constructor() {
        this._database = null;
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
     * @param {int} wadId
     * @returns {Promise<Object<number, object>>}
     */
    async list(wadId) {
        const slots = Object.create(null);
        for (const meta of await this._database.getAllByIndex(DoomDatabaseSchema.SAVE, DoomDatabaseSchema.SAVE_BY_WAD, wadId)) {
            slots[meta.slot] = meta;
        }

        return slots;
    }

    /**
     * @param {int}    wadId
     * @param {number} slot
     * @returns {Promise<{meta: object, snapshot: object}>}
     */
    async read(wadId, slot) {
        const meta   = await this._slot(wadId, slot);
        const record = ((meta !== null) ? await this._database.get(DoomDatabaseSchema.SAVE_FILE, meta.id) : null);
        if (record === null) {
            throw new Error('Save not found: WAD ' + wadId + ', slot ' + slot);
        }

        return {meta: meta, snapshot: record.snapshot};
    }

    /**
     * Writes metadata + snapshot in a single transaction; an existing slot is
     * replaced (the caller confirms the overwrite beforehand).
     *
     * @param {object} meta - {wadId, slot, levelCode, skill, savedAt, formatVersion}
     * @param {object} snapshot
     */
    async write(meta, snapshot) {
        await this._database.upsert(DoomDatabaseSchema.SAVE, DoomDatabaseSchema.SAVE_BY_SLOT, meta, [
            {storeName: DoomDatabaseSchema.SAVE_FILE, record: {snapshot: snapshot}}
        ]);
    }

    async remove(wadId, slot) {
        const meta = await this._slot(wadId, slot);
        if (meta === null) {
            return;
        }
        await this._database.deleteMulti([
            {storeName: DoomDatabaseSchema.SAVE, key: meta.id},
            {storeName: DoomDatabaseSchema.SAVE_FILE, key: meta.id}
        ]);
    }

    async _slot(wadId, slot) {
        return this._database.getByIndex(DoomDatabaseSchema.SAVE, DoomDatabaseSchema.SAVE_BY_SLOT, [wadId, slot]);
    }
}

const doomSaveStore = new DoomSaveStore();
