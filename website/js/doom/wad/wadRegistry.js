/**
 * Business facade of the WAD management - the only API used by the menu screens.
 * Validates the files (WadFile.parse) BEFORE storing them.
 */
class WadRegistry {
    /**
     * @param {WadStorage} storage
     */
    constructor(storage) {
        this._storage = storage;
    }

    async init() {
        await this._storage.open();

        return this;
    }

    /**
     * @returns {Promise<object[]>} metadata sorted by date of addition
     */
    async getList() {
        const list = await this._storage.listMeta();
        list.sort((a, b) => a.addedAt - b.addedAt);

        return list;
    }

    /**
     * Download a WAD from an URL and store it.
     * Raw fetch (no appBootstrap.buildUrl), with swBypass=1 so that the
     * Service Worker does not duplicate the WAD in the Cache Storage.
     *
     * @param {string} url
     * @returns {Promise<object>} the stored metadata
     */
    async addFromUrl(url) {
        const separator = ((url.indexOf('?') === -1) ? '?' : '&');

        let response;
        try {
            response = await fetch(url + separator + 'swBypass=1');
        } catch (error) {
            throw new WadError('fetch-failed', 'Unable to download the WAD: ' + error.message);
        }

        if (!response.ok) {
            throw new WadError('fetch-failed', 'Unable to download the WAD: HTTP ' + response.status);
        }

        const buffer = await response.arrayBuffer();

        return this._validateAndSave(buffer, this._extractFileName(url), {type: 'url', value: url});
    }

    /**
     * Read a local file and store it.
     *
     * @param {File} file
     * @returns {Promise<object>} the stored metadata
     */
    async addFromFile(file) {
        const buffer = await file.arrayBuffer();

        return this._validateAndSave(buffer, file.name, {type: 'file', value: file.name});
    }

    /**
     * @param {string} id
     */
    async remove(id) {
        await this._storage.deleteWad(id);
    }

    /**
     * @param {string} id
     * @returns {Promise<string[]>} the level names of the WAD
     */
    async getLevels(id) {
        const wadFile = await this.getWadFile(id);

        return wadFile.getLevelNames();
    }

    /**
     * Entry point for the dynamic conversion (phase 2).
     *
     * @param {string} id
     * @returns {Promise<WadFile>} the parsed WAD file
     */
    async getWadFile(id) {
        const stored = await this._storage.readWad(id);

        return new WadFile(stored.data).parse();
    }

    // --- Internal ---

    async _validateAndSave(buffer, name, source) {
        new WadFile(buffer).parse();

        const meta = {
            id:      this._buildId(name),
            name:    name,
            size:    buffer.byteLength,
            addedAt: Date.now(),
            source:  source
        };

        await this._storage.saveWad(meta, buffer);

        return meta;
    }

    _buildId(name) {
        return name.toLowerCase().replace(/\.wad$/, '');
    }

    _extractFileName(url) {
        const path = url.split('?')[0].split('#')[0];
        const parts = path.split('/').filter((part) => part !== '');

        return ((parts.length > 0) ? parts[parts.length - 1] : 'unknown.wad');
    }
}
