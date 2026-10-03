/**
 * The spipudoom database, version by version. 1 to 3 transcribe the stores as
 * they were created (WADs, settings, save slots, all keyed by a name); 4 moves
 * every store to an auto-incremented integer id, the saves rewired on the new
 * id of their WAD.
 *
 * Records:
 *  - wad: {id, name, size, addedAt, source: {type: 'url'|'file', value}, sha256?, title?, version?, branch?, rank?, described?}
 *    sha256 = identity of the file; title/version/branch/rank = its known edition (null when unknown; rank = release order
 *    within a branch); described = the editions table version they were read with; all absent until computed
 *  - wadFile: {id, data: ArrayBuffer} — one-to-one with its wad
 *  - setting: {id, key, value}
 *  - save: {id, wadId, slot, levelCode, skill, savedAt, formatVersion}
 *  - saveFile: {id, snapshot} — one-to-one with its save, only read on load
 */
class DoomDatabaseSchema {
    /**
     * @returns {AppDatabaseSchema}
     */
    static build() {
        const legacy = {autoIncrement: false};

        return new AppDatabaseSchema(DoomDatabaseSchema.NAME)
            .addVersion(1, (upgrade) => {
                upgrade.createStore('wadMeta', legacy).createStore('wadData', legacy);
            })
            .addVersion(2, (upgrade) => {
                upgrade.createStore('settings', {keyPath: 'key', autoIncrement: false});
            })
            .addVersion(3, (upgrade) => {
                upgrade.createStore('saveMeta', legacy).createStore('saveData', legacy);
            })
            .addVersion(4, (upgrade) => DoomDatabaseSchema._integerIds(upgrade));
    }

    static async _integerIds(upgrade) {
        upgrade
            .createStore(DoomDatabaseSchema.WAD)
            .createStore(DoomDatabaseSchema.WAD_FILE, {autoIncrement: false})
            .createStore(DoomDatabaseSchema.SAVE, {indexes: [
                {name: DoomDatabaseSchema.SAVE_BY_WAD,  keyPath: 'wadId'},
                {name: DoomDatabaseSchema.SAVE_BY_SLOT, keyPath: ['wadId', 'slot'], unique: true}
            ]})
            .createStore(DoomDatabaseSchema.SAVE_FILE, {autoIncrement: false})
            .createStore(DoomDatabaseSchema.SETTING, {indexes: [{name: DoomDatabaseSchema.SETTING_BY_KEY, keyPath: 'key', unique: true}]});

        const wadIds  = new Map();
        const saveIds = new Map();
        await upgrade.copy('wadMeta', DoomDatabaseSchema.WAD, (meta) => {
            wadIds.set(meta.id, (wadIds.size + 1));
            return Object.assign({}, meta, {id: wadIds.get(meta.id)});
        });
        await upgrade.copy('wadData', DoomDatabaseSchema.WAD_FILE, (file) => (
            (wadIds.has(file.id)) ? {id: wadIds.get(file.id), data: file.data} : null
        ));
        await upgrade.copy('saveMeta', DoomDatabaseSchema.SAVE, (meta) => {
            if (!wadIds.has(meta.wadId)) {
                return null;
            }
            saveIds.set(meta.id, {id: (saveIds.size + 1), wadId: wadIds.get(meta.wadId)});
            return Object.assign({}, meta, saveIds.get(meta.id));
        });
        await upgrade.copy('saveData', DoomDatabaseSchema.SAVE_FILE, (file) => {
            const save = saveIds.get(file.id);
            return ((save !== undefined) ? {id: save.id, snapshot: Object.assign({}, file.snapshot, {wadId: save.wadId})} : null);
        });
        await upgrade.copy('settings', DoomDatabaseSchema.SETTING, (row) => ({key: row.key, value: row.value}));
        for (const name of ['wadMeta', 'wadData', 'settings', 'saveMeta', 'saveData']) {
            upgrade.deleteStore(name);
        }
    }
}

DoomDatabaseSchema.NAME           = 'spipudoom';
DoomDatabaseSchema.WAD            = 'wad';
DoomDatabaseSchema.WAD_FILE       = 'wadFile';
DoomDatabaseSchema.SAVE           = 'save';
DoomDatabaseSchema.SAVE_FILE      = 'saveFile';
DoomDatabaseSchema.SETTING        = 'setting';
DoomDatabaseSchema.SAVE_BY_WAD    = 'wadId';
DoomDatabaseSchema.SAVE_BY_SLOT   = 'wadSlot';
DoomDatabaseSchema.SETTING_BY_KEY = 'key';
