class AppDatabase {
    /** @type {string}      */ dbName;
    /** @type {int}         */ dbVersion;
    /** @type {object[]}    */ storeDefinitions;
    /** @type {IDBDatabase} */ db;

    /**
     * @param {string}   dbName
     * @param {int}      dbVersion
     * @param {object[]} storeDefinitions - [{name: string, keyPath: string}]
     */
    constructor(dbName, dbVersion, storeDefinitions) {
        this.dbName = dbName;
        this.dbVersion = dbVersion;
        this.storeDefinitions = storeDefinitions;
        this.db = null;
    }

    isOpen() {
        return (this.db !== null);
    }

    async open() {
        if (this.isOpen()) {
            return this;
        }

        if (!window.indexedDB) {
            throw new Error('IndexedDB is not available in this browser');
        }

        this.db = await new Promise((resolve, reject) => {
            const request = window.indexedDB.open(this.dbName, this.dbVersion);
            request.onupgradeneeded = () => {
                this.createMissingStores(request.result);
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
    createMissingStores(db) {
        for (const definition of this.storeDefinitions) {
            if (!db.objectStoreNames.contains(definition.name)) {
                db.createObjectStore(definition.name, {keyPath: definition.keyPath});
            }
        }
    }

    async put(storeName, record) {
        await this.putMulti([{storeName: storeName, record: record}]);
    }

    async get(storeName, key) {
        const store = this.transaction([storeName], 'readonly').objectStore(storeName);
        const result = await this.promisifyRequest(store.get(key));

        return ((result === undefined) ? null : result);
    }

    async getAll(storeName) {
        const store = this.transaction([storeName], 'readonly').objectStore(storeName);

        return this.promisifyRequest(store.getAll());
    }

    async delete(storeName, key) {
        await this.deleteMulti([{storeName: storeName, key: key}]);
    }

    /**
     * Write all the records in a single transaction (atomicity).
     *
     * @param {object[]} records - [{storeName: string, record: object}]
     */
    async putMulti(records) {
        // Writing nothing is a legitimate no-op; IndexedDB refuses a transaction
        // without a store, so the empty batch never reaches it.
        if (records.length === 0) {
            return;
        }
        const storeNames = [...new Set(records.map((item) => item.storeName))];
        const transaction = this.transaction(storeNames, 'readwrite');

        for (const item of records) {
            transaction.objectStore(item.storeName).put(item.record);
        }

        await this.promisifyTransaction(transaction);
    }

    /**
     * Delete all the keys in a single transaction (atomicity).
     *
     * @param {object[]} keys - [{storeName: string, key: *}]
     */
    async deleteMulti(keys) {
        if (keys.length === 0) {
            return;
        }
        const storeNames = [...new Set(keys.map((item) => item.storeName))];
        const transaction = this.transaction(storeNames, 'readwrite');

        for (const item of keys) {
            transaction.objectStore(item.storeName).delete(item.key);
        }

        await this.promisifyTransaction(transaction);
    }

    transaction(storeNames, mode) {
        if (!this.isOpen()) {
            throw new Error('Database is not open');
        }

        return this.db.transaction(storeNames, mode);
    }

    promisifyRequest(request) {
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
     * Asks the browser to exempt this origin from storage eviction. Without it
     * the storage is best-effort: a large store can be dropped when the disk is
     * under pressure, or after a while without a visit.
     *
     * Origin-wide, hence static — it covers every database AND the Service
     * Worker cache at once. Call it on a deliberate user action that stores
     * something big: Firefox raises a permission prompt, which only makes sense
     * to the user at that moment.
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

    promisifyTransaction(transaction) {
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
