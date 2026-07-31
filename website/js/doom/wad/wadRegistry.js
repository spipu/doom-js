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
     * Rewrite the URL of a host whose paste-friendly form is not fetchable, to
     * the one that is. One method per host; anything unrecognized (and anything
     * that is not an absolute URL) passes through untouched.
     *
     * @param {string} input
     * @returns {string}
     */
    static normalizeUrl(input) {
        const raw = input.trim();

        let url;
        try {
            url = new URL(raw);
        } catch (error) {
            return raw;
        }
        if (url.hostname === 'github.com') {
            return WadRegistry.normalizeUrlGithub(url) ?? raw;
        }

        return raw;
    }

    /**
     * `github.com/<owner>/<repo>/raw|blob/…` only 302s toward
     * raw.githubusercontent.com, with an empty Access-Control-Allow-Origin the
     * browser rejects before following it; a cross-origin redirect being opaque,
     * predicting the target host is the only client-side fix. Release assets
     * redirect to a signed URL and stay unreachable ('fetch-blocked').
     *
     * @param {URL} url
     * @returns {string|null} null when the path is not a repository file
     */
    static normalizeUrlGithub(url) {
        const parts = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:raw|blob)\/(.+)$/);
        if (parts === null) {
            return null;
        }
        // github.com spells the ref as refs/heads|refs/tags, the raw host does not
        const ref = parts[3].replace(/^refs\/(?:heads|tags)\//, '');

        return 'https://raw.githubusercontent.com/' + parts[1] + '/' + parts[2] + '/' + ref + url.search;
    }

    /**
     * Same URL carrying the swBypass=1 marker the Service Worker looks for, so
     * it serves the download from the network and never duplicates a 30 MB WAD
     * in the Cache Storage.
     *
     * Built through URL rather than by concatenation: appended by hand, the
     * marker lands INSIDE a fragment when the URL has one (…doom.wad#sha256),
     * and since Request.url drops fragments the worker would never see it. A
     * relative URL is resolved against the page, exactly like fetch would.
     *
     * @param {string} url
     * @returns {string}
     */
    static bypassUrl(url) {
        const parsed = new URL(url, window.location.href);
        parsed.searchParams.set('swBypass', '1');

        return parsed.href;
    }

    /**
     * Download a WAD from an URL and store it.
     * Raw fetch (no appBootstrap.buildUrl), with swBypass=1 so that the
     * Service Worker does not duplicate the WAD in the Cache Storage.
     *
     * @param {string} rawUrl
     * @returns {Promise<object>} the stored metadata
     */
    async addFromUrl(rawUrl) {
        const url = WadRegistry.normalizeUrl(rawUrl);

        let response;
        try {
            response = await fetch(WadRegistry.bypassUrl(url));
        } catch (error) {
            throw this._downloadError(url, error);
        }

        if (!response.ok) {
            throw new WadError(
                'fetch-http',
                'Unable to download the WAD: HTTP ' + response.status,
                'HTTP ' + response.status
            );
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

    // A rejected fetch never says why: the browser hides a CORS refusal from the
    // page, so the cause is inferred — on another origin it is in practice a
    // missing CORS header, a permanent failure (hence the UI's local-file advice).
    _downloadError(url, error) {
        if (navigator.onLine === false) {
            return new WadError('fetch-offline', 'Unable to download the WAD: offline');
        }
        if (this._isCrossOrigin(url)) {
            return new WadError(
                'fetch-blocked',
                'Unable to download the WAD: blocked by the browser (CORS)',
                this._hostOf(url)
            );
        }

        return new WadError('fetch-failed', 'Unable to download the WAD: ' + error.message);
    }

    _isCrossOrigin(url) {
        const parsed = this._parseUrl(url);

        return ((parsed !== null) && (parsed.origin !== window.location.origin));
    }

    // host and not hostname: two ports of one machine are two origins.
    _hostOf(url) {
        const parsed = this._parseUrl(url);

        return ((parsed !== null) ? parsed.host : null);
    }

    _parseUrl(url) {
        try {
            return new URL(url, window.location.href);
        } catch (error) {
            return null;
        }
    }

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
