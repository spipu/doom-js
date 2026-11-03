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
    // "major.minor": a change the saved level state no longer replays bumps the
    // minor, a change of the player's state the major (compatibilityOf).
    static FORMAT_VERSION = '2.1';

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

    /**
     * How far a snapshot's format is from the game's: the same, a minor one
     * (the level state no longer replays, the player's state still reads) or
     * a major one (nothing reads). A level-start snapshot only keeps the
     * player's state, so a minor gap leaves it whole. The first saves wrote a
     * plain number, read as its major version.
     *
     * @param {object} snapshot
     * @returns {string} COMPAT_SAME, COMPAT_MINOR or COMPAT_MAJOR
     */
    static compatibilityOf(snapshot) {
        const saved   = DoomSaveStore._parseVersion(snapshot.formatVersion);
        const current = DoomSaveStore._parseVersion(DoomSaveStore.FORMAT_VERSION);
        if (saved.major !== current.major) {
            return DoomSaveStore.COMPAT_MAJOR;
        }
        if ((saved.minor === current.minor) || DoomGameSnapshot.isLevelStart(snapshot)) {
            return DoomSaveStore.COMPAT_SAME;
        }

        return DoomSaveStore.COMPAT_MINOR;
    }

    static _parseVersion(version) {
        const parts = String(version).split('.');

        return {major: Number(parts[0]), minor: Number(parts[1] ?? 0)};
    }

    async _slot(wadId, slot) {
        return this._database.getByIndex(DoomDatabaseSchema.SAVE, DoomDatabaseSchema.SAVE_BY_SLOT, [wadId, slot]);
    }
}

DoomSaveStore.COMPAT_SAME  = 'same';
DoomSaveStore.COMPAT_MINOR = 'minor';
DoomSaveStore.COMPAT_MAJOR = 'major';

const doomSaveStore = new DoomSaveStore();
