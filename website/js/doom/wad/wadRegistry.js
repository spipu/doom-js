/**
 * Facade of the WAD management, the only API the menu screens use. A file is
 * validated (WadFile.parse) before it is stored.
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
     * @returns {Promise<object[]>} metadata sorted by title, then release,
     *                              then file name (natural order: doom2 before doom10)
     */
    async getList() {
        const list = await this._storage.listMeta();
        list.sort((a, b) => (WadRegistry._compare(WadRegistry.displayTitle(a), WadRegistry.displayTitle(b))
            || ((a.rank ?? WadRegistry.NO_RANK) - (b.rank ?? WadRegistry.NO_RANK))
            || WadRegistry._compare(a.name, b.name)));

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
        const pathMatch = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:raw|blob)\/(.+)$/);
        if (pathMatch === null) {
            return null;
        }
        // github.com spells the ref as refs/heads|refs/tags, the raw host does not
        const ref = pathMatch[3].replace(/^refs\/(?:heads|tags)\//, '');

        return 'https://raw.githubusercontent.com/' + pathMatch[1] + '/' + pathMatch[2] + '/' + ref + url.search;
    }

    /**
     * Same URL carrying the swBypass=1 marker the Service Worker looks for, so
     * it serves the download from the network and never duplicates a 30 MB WAD
     * in the Cache Storage.
     *
     * Built through URL: concatenated by hand, the marker would land inside a
     * fragment (…doom.wad#sha256), which Request.url drops.
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
     * Download a WAD from an URL: raw fetch (no appBootstrap.buildUrl) through
     * bypassUrl. Nothing is stored before applyImport.
     *
     * @param {string} rawUrl
     * @returns {Promise<object>} the import, see _prepareImport
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

        return this._prepareImport(buffer, this._extractFileName(url), {type: 'url', value: url});
    }

    /**
     * Read a local file. Nothing is stored before applyImport.
     *
     * @param {File} file
     * @returns {Promise<object>} the import, see _prepareImport
     */
    async addFromFile(file) {
        const buffer = await file.arrayBuffer();

        return this._prepareImport(buffer, file.name, {type: 'file', value: file.name});
    }

    /**
     * @param {object} wadImport - from addFromUrl / addFromFile
     * @returns {Promise<object>} the stored metadata
     */
    async applyImport(wadImport) {
        if (wadImport.replaced === null) {
            await this._storage.saveWad(wadImport.meta, wadImport.buffer);
            return wadImport.meta;
        }
        const restarted = wadImport.saves.restarted.map((save) => ({id: save.meta.id, snapshot: DoomGameSnapshot.levelStartOf(save.snapshot)}));
        const removed   = wadImport.saves.removed.map((save) => save.meta.id);
        await this._storage.replaceWad(wadImport.meta, wadImport.buffer, restarted, removed);

        return wadImport.meta;
    }

    /**
     * @param {string} id
     */
    async remove(id) {
        await this._storage.deleteWad(id);
    }

    /**
     * Episodes actually present in the WAD, in episode order. The levels are
     * grouped by their ExMy episode digit (a MAPxx set forms one single
     * group), each group starts at its lowest map, and the game profile
     * provides the display name (a proper noun, never translated — null when
     * it declares none: the screen then only shows the episode number).
     *
     * @param {string} id
     * @returns {Promise<object[]>} [{episode, firstLevel, name}]
     */
    async getEpisodes(id) {
        const wadFile = await this.getWadFile(id);
        const names   = new GameProfileList().getForWad(wadFile).episodeNames();

        return WadRegistry._episodeStarts(wadFile.getLevelNames()).map((entry) => ({
            ...entry,
            name: (names[entry.firstLevel.toUpperCase()] ?? null)
        }));
    }

    /**
     * @param {string} id
     * @returns {Promise<WadFile>} the parsed WAD file
     */
    async getWadFile(id) {
        const stored = await this._storage.readWad(id);

        return new WadFile(stored.data).parse();
    }

    /**
     * Identity of a stored WAD: the SHA-256 of its whole file, which two
     * devices compare to know they play the same WAD, plus the title and
     * version of a known edition. Computed and stored when missing or
     * outdated; the hash stays null while Web Crypto is unavailable, retried
     * on the next call.
     *
     * @param {object} meta - stored metadata, updated in place
     * @returns {Promise<string|null>} the SHA-256
     */
    async ensureIdentity(meta) {
        if ((typeof meta.sha256 === 'string') && WadRegistry.isDescribed(meta)) {
            return meta.sha256;
        }
        const stored = await this._storage.readWad(meta.id);
        Object.assign(meta, await this._describe(stored.data));
        if (typeof meta.sha256 !== 'string') {
            return null;
        }
        await this._storage.saveMeta(meta);

        return meta.sha256;
    }

    /**
     * @param {object} meta
     * @returns {boolean} false for a WAD stored before the current title and version rules
     */
    static isDescribed(meta) {
        return (meta.described === WadRegistry.DESCRIPTION_VERSION);
    }

    /**
     * @param {object} meta
     * @returns {string|null} the version of a known edition ("v1.9", "BFG Edition"),
     *          else the first characters of the identity, enough to tell two WADs apart by eye
     */
    static versionLabel(meta) {
        if (typeof meta.version === 'string') {
            return ((WadRegistry.NUMBERED_VERSION.test(meta.version)) ? WadRegistry.VERSION_PREFIX + meta.version : meta.version);
        }

        return ((typeof meta.sha256 === 'string') ? meta.sha256.slice(0, WadRegistry.SHORT_IDENTITY_LENGTH) : null);
    }

    /**
     * @param {object} meta
     * @returns {string} "title - version label" when there is a label, the title alone otherwise
     */
    static displayLabel(meta) {
        const version = WadRegistry.versionLabel(meta);

        return WadRegistry.displayTitle(meta) + ((version !== null) ? WadRegistry.LABEL_SEPARATOR + version : '');
    }

    /**
     * Display title of a stored WAD: the game and edition of a known file,
     * else the file name without its extension. meta.name itself stays
     * untouched — the registry lookups rely on the raw file name.
     *
     * @param {object} meta
     * @returns {string}
     */
    static displayTitle(meta) {
        return (meta.title ?? meta.name.replace(/\.wad$/i, ''));
    }

    // --- Internal ---

    // Group the level codes into episodes: an ExMy map belongs to episode x,
    // which starts at its lowest y; everything else (MAPxx sets, free-form
    // markers) forms one single episode starting at the first level listed.
    static _episodeStarts(levels) {
        const groups = new Map();
        for (const name of levels) {
            const code  = WadLevelCode.parse(name);
            const key   = ((code.episode !== null) ? code.episode : 0);
            const rank  = ((code.episode !== null) ? code.map : Number.MAX_SAFE_INTEGER);
            const found = groups.get(key);
            if ((found === undefined) || (rank < found.rank)) {
                groups.set(key, {rank: rank, firstLevel: name});
            }
        }

        // The non-ExMy group goes last, numbered after the ExMy episodes — a
        // mixed WAD would otherwise show two "Episode 1".
        const keys = [...groups.keys()].sort((a, b) => (a - b));
        if ((keys[0] === 0) && (keys.length > 1)) {
            keys.push(keys.shift());
        }

        return keys.map((key) => ({
            episode:    ((key !== 0) ? key : ((keys.length > 1) ? (Math.max(...keys) + 1) : 1)),
            firstLevel: groups.get(key).firstLevel
        }));
    }

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

    /**
     * @returns {Promise<{meta: object, buffer: ArrayBuffer, replaced: object|null,
     *          saves: {restarted: object[], removed: object[]}|null}>}
     *          replaced = the stored WAD an update overwrites, null for a new one;
     *          saves = the saves ({meta, snapshot}) the update restarts or deletes, the others untouched
     */
    async _prepareImport(buffer, name, source) {
        const meta = {
            id:      this._buildId(name),
            name:    name,
            size:    buffer.byteLength,
            addedAt: Date.now(),
            source:  source
        };
        Object.assign(meta, await this._describe(buffer));

        const stored = await this._describedList();
        const same   = stored.find((other) => ((typeof meta.sha256 === 'string') && (other.sha256 === meta.sha256)));
        if (same !== undefined) {
            throw new WadError('duplicate', 'WAD already stored', WadRegistry.displayLabel(same));
        }
        const releases = stored.filter((other) => ((meta.rank !== null) && (other.title === meta.title) && (other.rank !== null)));
        const newer    = releases.find((other) => (other.rank > meta.rank));
        if (newer !== undefined) {
            throw new WadError('older-edition', 'A newer release of this WAD is stored', WadRegistry.displayLabel(newer));
        }
        const replaced = (releases.filter((other) => (other.rank < meta.rank)).sort((a, b) => (b.rank - a.rank))[0] ?? null);
        if (replaced === null) {
            return {meta: meta, buffer: buffer, replaced: null, saves: null};
        }
        meta.id = replaced.id;

        return {meta: meta, buffer: buffer, replaced: replaced, saves: await this._sortSaves(replaced.id, buffer)};
    }

    async _describedList() {
        const list = await this._storage.listMeta();
        for (const meta of list.filter((other) => !WadRegistry.isDescribed(other))) {
            await this.ensureIdentity(meta);
        }

        return list;
    }

    async _sortSaves(wadId, buffer) {
        const saves  = await this._storage.readSaves(wadId);
        const sorted = {restarted: [], removed: []};
        if (saves.length === 0) {
            return sorted;
        }
        const before = new WadFile((await this._storage.readWad(wadId)).data).parse();
        const after  = new WadFile(buffer).parse();
        const levels = after.getLevelNames();
        for (const save of saves) {
            const level = save.meta.levelCode;
            if (!levels.includes(level)) {
                sorted.removed.push(save);
            } else if (!DoomGameSnapshot.isLevelStart(save.snapshot) && !before.mapEquals(after, level)) {
                sorted.restarted.push(save);
            }
        }

        return sorted;
    }

    async _describe(buffer) {
        new WadFile(buffer).parse();
        const sha256  = await AppHash.sha256Hex(buffer);
        const edition = DoomWadEditions.describe(await AppHash.sha1Hex(buffer));
        const described = {
            title:     (edition?.name ?? null),
            version:   (edition?.version ?? null),
            rank:      (edition?.rank ?? null),
            described: WadRegistry.DESCRIPTION_VERSION
        };
        if (sha256 !== null) {
            described.sha256 = sha256;
        }

        return described;
    }

    static _compare(a, b) {
        return a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'});
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

WadRegistry.SHORT_IDENTITY_LENGTH = 8;
// Bump when the editions table changes: stored WADs are described again.
WadRegistry.DESCRIPTION_VERSION   = 3;
WadRegistry.NO_RANK               = -1;
WadRegistry.NUMBERED_VERSION      = /^\d/;
WadRegistry.VERSION_PREFIX        = 'v';
WadRegistry.LABEL_SEPARATOR       = ' - ';
