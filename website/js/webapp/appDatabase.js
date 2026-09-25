class AppDatabase {
    /** @type {string}      */ _dbName;
    /** @type {int}         */ _dbVersion;
    /** @type {object[]}    */ _storeDefinitions;
    /** @type {IDBDatabase} */ _db;

    /**
     * @param {string}   dbName
     * @param {int}      dbVersion
     * @param {object[]} storeDefinitions - [{name: string, keyPath: string}]
     */
    constructor(dbName, dbVersion, storeDefinitions) {
        this._dbName = dbName;
        this._dbVersion = dbVersion;
        this._storeDefinitions = storeDefinitions;
        this._db = null;
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
            const request = window.indexedDB.open(this._dbName, this._dbVersion);
            request.onupgradeneeded = () => {
                this._createMissingStores(request.result);
            };
            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => {
                reject(request.error);
            };
        });

        return this;
    }

    /**
     * @param {IDBDatabase} db
     */
    _createMissingStores(db) {
        for (const definition of this._storeDefinitions) {
            if (!db.objectStoreNames.contains(definition.name)) {
                db.createObjectStore(definition.name, {keyPath: definition.keyPath});
            }
        }
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

    async delete(storeName, key) {
        await this.deleteMulti([{storeName: storeName, key: key}]);
    }

    /**
     * Writes every record in a single transaction.
     *
     * @param {object[]} records - [{storeName: string, record: object}]
     */
    async putMulti(records) {
        // IndexedDB refuses a transaction over zero stores.
        if (records.length === 0) {
            return;
        }
        const storeNames = [...new Set(records.map((item) => item.storeName))];
        const transaction = this._transaction(storeNames, 'readwrite');

        for (const item of records) {
            transaction.objectStore(item.storeName).put(item.record);
        }

        await this._promisifyTransaction(transaction);
    }

    /**
     * Deletes every key in a single transaction.
     *
     * @param {object[]} keys - [{storeName: string, key: *}]
     */
    async deleteMulti(keys) {
        if (keys.length === 0) {
            return;
        }
        const storeNames = [...new Set(keys.map((item) => item.storeName))];
        const transaction = this._transaction(storeNames, 'readwrite');

        for (const item of keys) {
            transaction.objectStore(item.storeName).delete(item.key);
        }

        await this._promisifyTransaction(transaction);
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
