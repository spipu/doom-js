class AppDatabase {
    /** @type {AppDatabaseSchema} */ _schema;
    /** @type {IDBDatabase}       */ _db;
    /** @type {function|null}     */ _onBlocked;

    /**
     * @param {AppDatabaseSchema} schema
     */
    constructor(schema) {
        this._schema    = schema;
        this._db        = null;
        this._onBlocked = null;
    }

    /**
     * @param {function|null} callback - fired when the upgrade waits for other tabs to close their connection
     */
    setOnBlocked(callback) {
        this._onBlocked = callback;

        return this;
    }

    isOpen() {
        return (this._db !== null);
    }

    async open() {
        if (this.isOpen()) {
            return this;
        }

        if (!window.indexedDB) {
            throw new Error('IndexedDB is not available in this browser');
        }

        this._db = await new Promise((resolve, reject) => {
            const request = window.indexedDB.open(this._schema.getName(), this._schema.getVersion());
            let failure   = null;
            request.onupgradeneeded = (event) => {
                this._schema.upgrade(new AppDatabaseUpgrade(request.result, request.transaction), event.oldVersion).catch((error) => {
                    failure = error;
                    request.transaction.abort();
                });
            };
            request.onblocked = () => {
                console.warn('AppDatabase - the upgrade of [' + this._schema.getName() + '] waits for its other tabs to close');
                this._onBlocked?.();
            };
            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => {
                reject(failure ?? request.error);
            };
        });
        // A later version opened in another tab must not wait for this one.
        this._db.onversionchange = () => {
            console.warn('AppDatabase - [' + this._schema.getName() + '] closed for a newer version opened elsewhere');
            this._db.close();
            this._db = null;
        };

        return this;
    }

    async put(storeName, record) {
        await this.putMulti([{storeName: storeName, record: record}]);
    }

    async get(storeName, key) {
        const store = this._transaction([storeName], 'readonly').objectStore(storeName);
        const result = await this._promisifyRequest(store.get(key));

        return ((result === undefined) ? null : result);
    }

    async getAll(storeName) {
        const store = this._transaction([storeName], 'readonly').objectStore(storeName);

        return this._promisifyRequest(store.getAll());
    }

    async getByIndex(storeName, indexName, value) {
        const index  = this._transaction([storeName], 'readonly').objectStore(storeName).index(indexName);
        const result = await this._promisifyRequest(index.get(value));

        return ((result === undefined) ? null : result);
    }

    async getAllByIndex(storeName, indexName, value) {
        const index = this._transaction([storeName], 'readonly').objectStore(storeName).index(indexName);

        return this._promisifyRequest(index.getAll(value));
    }

    async clear(storeName) {
        const transaction = this._transaction([storeName], 'readwrite');
        transaction.objectStore(storeName).clear();

        await this._promisifyTransaction(transaction);
    }

    /**
     * Adds a record under a new id, with its linked records stored under the
     * same id, in a single transaction.
     *
     * @param {string}   storeName
     * @param {object}   record - its id, if any, is ignored
     * @param {object[]} linked - [{storeName, record}], one-to-one with the record
     * @returns {Promise<int>} the id
     */
    async insert(storeName, record, linked = []) {
        return this._putUnderId(storeName, record, null, linked);
    }

    /**
     * Writes a record over the one a unique index finds, or under a new id,
     * with its linked records, in a single transaction.
     *
     * @param {string}   storeName
     * @param {string}   indexName - a unique index of the store
     * @param {object}   record    - its id, if any, is ignored
     * @param {object[]} linked    - [{storeName, record}], one-to-one with the record
     * @returns {Promise<int>} the id
     */
    async upsert(storeName, indexName, record, linked = []) {
        return this._putUnderId(storeName, record, indexName, linked);
    }

    async delete(storeName, key) {
        await this.deleteMulti([{storeName: storeName, key: key}]);
    }

    /**
     * Writes every record in a single transaction.
     *
     * @param {object[]} records - [{storeName: string, record: object}]
     */
    async putMulti(records) {
        await this.writeMulti(records, []);
    }

    /**
     * Deletes every key in a single transaction.
     *
     * @param {object[]} keys - [{storeName: string, key: *}]
     */
    async deleteMulti(keys) {
        await this.writeMulti([], keys);
    }

    /**
     * Writes the records and deletes the keys in a single transaction.
     *
     * @param {object[]} records - [{storeName: string, record: object}]
     * @param {object[]} keys    - [{storeName: string, key: *}]
     */
    async writeMulti(records, keys) {
        // IndexedDB refuses a transaction over zero stores.
        if ((records.length === 0) && (keys.length === 0)) {
            return;
        }
        const storeNames  = [...new Set([...records, ...keys].map((item) => item.storeName))];
        const transaction = this._transaction(storeNames, 'readwrite');

        for (const item of records) {
            transaction.objectStore(item.storeName).put(item.record);
        }
        for (const item of keys) {
            transaction.objectStore(item.storeName).delete(item.key);
        }

        await this._promisifyTransaction(transaction);
    }

    _putUnderId(storeName, record, indexName, linked) {
        const transaction = this._transaction([storeName, ...linked.map((item) => item.storeName)], 'readwrite');
        const store       = transaction.objectStore(storeName);
        const done        = this._promisifyTransaction(transaction);
        let id            = null;
        const write = (existingId) => {
            const stored = Object.assign({}, record);
            delete stored[store.keyPath];
            if (existingId !== undefined) {
                stored[store.keyPath] = existingId;
            }
            store.put(stored).onsuccess = (event) => {
                id = event.target.result;
                for (const item of linked) {
                    transaction.objectStore(item.storeName).put(Object.assign({}, item.record, {[store.keyPath]: id}));
                }
            };
        };
        if (indexName === null) {
            write(undefined);
        } else {
            const index = store.index(indexName);
            index.getKey(AppDatabase._indexValue(index, record)).onsuccess = (event) => {
                write(event.target.result);
            };
        }

        return done.then(() => id);
    }

    static _indexValue(index, record) {
        return ((Array.isArray(index.keyPath)) ? index.keyPath.map((path) => record[path]) : record[index.keyPath]);
    }

    _transaction(storeNames, mode) {
        if (!this.isOpen()) {
            throw new Error('Database is not open');
        }

        return this._db.transaction(storeNames, mode);
    }

    _promisifyRequest(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Asks the browser to exempt this origin (every database and the Service
     * Worker cache) from storage eviction. Call it on a user action that stores
     * something big: Firefox shows a permission prompt.
     *
     * @returns {Promise<boolean>} true when the origin is persisted
     */
    static async requestPersistentStorage() {
        if (!navigator.storage || !navigator.storage.persist) {
            return false;
        }

        try {
            if (await navigator.storage.persisted()) {
                return true;
            }

            return await navigator.storage.persist();
        } catch (error) {
            console.warn('AppDatabase - unable to request persistent storage: ' + error.message);

            return false;
        }
    }

    _promisifyTransaction(transaction) {
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                resolve();
            };
            transaction.onerror = () => {
                reject(transaction.error);
            };
            transaction.onabort = () => {
                reject(transaction.error ?? new Error('Transaction aborted'));
            };
        });
    }
}
