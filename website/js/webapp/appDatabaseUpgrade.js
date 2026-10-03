/**
 * The operations a schema version runs inside the upgrade transaction.
 */
class AppDatabaseUpgrade {
    /** @type {IDBDatabase}    */ _db;
    /** @type {IDBTransaction} */ _transaction;

    /**
     * @param {IDBDatabase}    db
     * @param {IDBTransaction} transaction - the versionchange one
     */
    constructor(db, transaction) {
        this._db          = db;
        this._transaction = transaction;
    }

    /**
     * @param {string} name
     * @param {object} options - {keyPath, autoIncrement, indexes: [{name, keyPath, unique}]};
     *                           an unsigned auto-incremented "id" by default
     */
    createStore(name, options = {}) {
        const store = this._db.createObjectStore(name, {
            keyPath:       (options.keyPath ?? AppDatabaseUpgrade.KEY_PATH),
            autoIncrement: (options.autoIncrement ?? true)
        });
        for (const index of (options.indexes ?? [])) {
            store.createIndex(index.name, index.keyPath, {unique: (index.unique ?? false)});
        }

        return this;
    }

    deleteStore(name) {
        this._db.deleteObjectStore(name);

        return this;
    }

    /**
     * Every record of a store, one at a time in key order, into another store.
     *
     * @param {string}                        from
     * @param {string}                        to
     * @param {function(object): object|null} transform - null drops the record
     * @returns {Promise<void>}
     */
    copy(from, to, transform) {
        const target = this._transaction.objectStore(to);

        return new Promise((resolve, reject) => {
            const request = this._transaction.objectStore(from).openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor === null) {
                    resolve();
                    return;
                }
                const record = transform(cursor.value);
                if (record !== null) {
                    target.put(record);
                }
                cursor.continue();
            };
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
}

AppDatabaseUpgrade.KEY_PATH = 'id';
