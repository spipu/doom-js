class AppDefinition {
    /** @type {string[]}    */ _definitionUrls;
    /** @type {string|null} */ _version;
    /** @type {Object|null} */ _files;

    constructor(definitionUrls) {
        this._definitionUrls = definitionUrls;
        this._version = null;
        this._files = null;
    }

    getVersion() {
        return ((this._version !== null) ? this._version : '');
    }

    getFiles(type) {
        return ((this._files !== null) ? this._files[type] : []);
    }

    getFile(type, index) {
        return (this.getFiles(type)[index] ?? null);
    }

    countFiles() {
        return AppDefinition.FILE_TYPES.reduce((total, type) => total + this.getFiles(type).length, 0);
    }

    hasSameVersion(other) {
        return (this.getVersion() === other.getVersion());
    }

    loadFromLocalStorage() {
        this._version = null;
        this._files = null;

        const values = localStorage.getItem(this._storageKey());
        if (!values) {
            return false;
        }

        let parsed;
        try {
            parsed = JSON.parse(values);
        } catch {
            return false;
        }
        if (!this._isValidManifest(parsed)) {
            return false;
        }

        this._version = parsed.version;
        this._files = parsed.files;
        return true;
    }

    _isValidManifest(parsed) {
        if (!(parsed instanceof Object) || (typeof parsed.version !== 'string') || !(parsed.files instanceof Object)) {
            return false;
        }
        return AppDefinition.FILE_TYPES.every((type) => Array.isArray(parsed.files[type]));
    }

    async loadFromServer() {
        try {
            const versions = [];
            const files = {assets: [], css: [], js: []};

            for (const url of this._definitionUrls) {
                const response = await fetch(url + '?swBypass=1&_=' + (new Date()).getTime());
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status + ' ' + response.statusText);
                }
                const definition = await response.json();
                if (!this._isValidManifest(definition)) {
                    throw new Error('Invalid bootstrap manifest');
                }

                versions.push(definition.version);
                files.assets = files.assets.concat(definition.files['assets']);
                files.css    = files.css.concat(definition.files['css']);
                files.js     = files.js.concat(definition.files['js']);
            }

            this._version = versions.join('|');
            this._files = files;
            return true;
        } catch {
            this._version = null;
            this._files = null;
            return false;
        }
    }

    saveToLocalStorage() {
        // Persisting is an optimization for the next visit: a failed write must not abort the boot.
        try {
            localStorage.setItem(this._storageKey(), JSON.stringify({version: this._version, files: this._files}));
        } catch {
        }
    }

    _storageKey() {
        return "app.version." + this._definitionUrls.join('|');
    }
}

AppDefinition.FILE_TYPES = ['assets', 'css', 'js'];

class AppBootstrap {
    /** @type {int}           */ currentFile;
    /** @type {AppDefinition} */ appDefinition;
    /** @type {boolean}  */ offline;
    /** @type {int}      */ loadingStepCurrent;
    /** @type {int}      */ loadingStepMax;
    /** @type {int}      */ loadingFileCurrent;
    /** @type {int}      */ loadingFileMax;
    /** @type {boolean}  */ pwaMode;
    /** @type {boolean}  */ pwaDisabled;
    /** @type {string[]} */ definitionUrls;
    /** @type {Function} */ readyCallback;
    /** @type {Object}   */ stats;

    constructor() {
        this.pwaDisabled = false;
        this.definitionUrls = [];
        this.readyCallback = null;
        this.stats = null;
        this.appDefinition = null;
    }

    disablePwaMode() {
        this.pwaDisabled = true;
    }

    addBootstrapDefinition(jsonUrl) {
        this.definitionUrls.push(jsonUrl);
    }

    setReadyCallback(callback) {
        this.readyCallback = callback;
    }

    getVersion() {
        return ((this.appDefinition !== null) ? this.appDefinition.getVersion() : '');
    }

    trackVersionEvent(mode, definition) {
        if (this.pwaDisabled) {
            return;
        }
        const url = './ping.json?swBypass=1&m=' + mode + '&v=' + encodeURIComponent(definition.getVersion()) + '&t=' + (new Date()).getTime();
        // keepalive: the update ping must survive the reload that follows the cache clear.
        fetch(url, {cache: 'no-store', keepalive: true}).catch(() => {});
    }

    buildUrl(url) {
        if (this.pwaMode) {
            return url;
        }
        return url + '?v=' + encodeURIComponent(this.getVersion());
    }

    fetchJson(url, callback) {
        fetch(this.buildUrl(url))
            .then(r => {
                if (!r.ok) {
                    throw new Error('HTTP ' + r.status + ' ' + r.statusText);
                }
                return r.json();
            })
            .then(data => callback(data))
            .catch(e => this.logError('Failed to load "' + url + '"', e));
    }

    init() {
        if (this.definitionUrls.length === 0) {
            this.logError("No bootstrap definition added - use appBootstrap.addBootstrapDefinition(jsonUrl)");
            return;
        }

        if (this.pwaDisabled) {
            this.bootstrapClassic();
            return;
        }

        if ("serviceWorker" in navigator) {
            this.bootstrapPwa();
            return;
        }

        this.logError("Your browser is not compatible with PWA and service workers");
        this.bootstrapClassic();
    }

    bootstrapPwa() {
        this.pwaMode = true;
        navigator.serviceWorker
            .register("./appServiceWorker.js")
            .then(() => {
                navigator.serviceWorker.ready.then((registration) => {
                    this.serviceWorker = registration;
                    navigator.serviceWorker.onmessage = this.serviceWorkerListen.bind(this);
                    this.checkVersion();
                });
            })
            .catch((error) => {
                this.logError("Error registering the Service Worker", error);
                this.bootstrapClassic();
            });
    }

    bootstrapClassic() {
        this.pwaMode = false;
        this.logDebug('Disable PWA feature');
        this.checkVersion();
    }

    serviceWorkerListen(event) {
        let message = JSON.parse(event.data);
        let eventCode = message.code;
        let eventContext = message.context;

        switch (eventCode) {
            case 'cacheCleared':
                window.location.reload();
                break;

            case 'statsAsked':
                this.refreshStats(eventContext);
                break;

            default:
                this.logError('Unknown message ' + eventCode, eventContext);
        }
    }

    askStats() {
        if (this.pwaMode) {
            this.serviceWorker.active.postMessage("askStats");
        }
    }

    refreshStats(stats) {
        this.stats = stats;
    }

    getStats() {
        return this.stats;
    }

    getStatsText() {
        const mode = ((this.pwaMode) ? 'PWA' : 'Classic') + ((this.offline) ? ' Offline' : '');

        if (!this.pwaMode) {
            return '[' + mode + ']';
        }

        if (this.stats === null) {
            return '[' + mode + '] no stats';
        }

        return '[' + mode + '] queries: ' + this.stats.fetchTotal + ' | server: ' + this.stats.fetchServer + ' | cache: ' + this.stats.fetchCache;
    }

    async checkVersion() {
        const currentDefinition = new AppDefinition(this.definitionUrls);
        const hasCurrent = currentDefinition.loadFromLocalStorage();

        const serverDefinition = new AppDefinition(this.definitionUrls);
        const hasServer = await serverDefinition.loadFromServer();

        if (!hasCurrent) {
            if (!hasServer) {
                this.offline = true;
                this.logError("You need network connexion to load the app");
                return;
            }

            this.offline = false;
            this.logDebug('OnLine - first install');
            this.trackVersionEvent('install', serverDefinition);
            this.appDefinition = serverDefinition;
            this.appDefinition.saveToLocalStorage();
            this.loadApp();
            return;
        }

        if (!hasServer) {
            this.offline = true;
            this.logDebug('OffLine Mode');
            this.appDefinition = currentDefinition;
            this.loadApp();
            return;
        }

        this.offline = false;
        if (currentDefinition.hasSameVersion(serverDefinition)) {
            this.logDebug('OnLine Mode');
            this.trackVersionEvent('start', currentDefinition);
            this.appDefinition = currentDefinition;
            this.loadApp();
            return;
        }

        this.logDebug('Need update');
        this.trackVersionEvent('update', serverDefinition);
        this.appDefinition = serverDefinition;
        this.appDefinition.saveToLocalStorage();
        if (!this.pwaMode) {
            this.clearServiceWorkerCache();
            return;
        }
        this.serviceWorker.active.postMessage("clearCache");
    }

    async clearServiceWorkerCache() {
        if ("serviceWorker" in navigator) {
            let registration = await navigator.serviceWorker.getRegistration();
            if (registration && registration.active) {
                navigator.serviceWorker.onmessage = this.serviceWorkerListen.bind(this);
                registration.active.postMessage("clearCache");
                return;
            }
        }
        window.location.reload();
    }

    async loadApp() {
        if (this.pwaMode) {
            this.serviceWorker.active.postMessage("resetStats");
        }

        this.loadingStepCurrent = 0;
        this.loadingStepMax     = 1;
        this.loadingFileCurrent = 0;
        this.loadingFileMax     = this.appDefinition.countFiles();
        this.displayLoadingBar();

        this.currentFile = 0;
        if (this.appDefinition.getFiles('assets').length > 0) {
            this.loadNextAsset();
            return;
        }
        if (this.appDefinition.getFiles('css').length > 0) {
            this.loadNextCssFile();
            return;
        }
        this.loadNextJsFile();
    }

    async loadNextAsset() {
        if (await this.resourceLoad(this.appDefinition.getFile('assets', this.currentFile))) {
            this.assetSuccess();
        }
    }

    assetSuccess() {
        this.loadingFileCurrent ++;
        this.displayLoadingBar();

        this.currentFile++;
        if (this.currentFile < this.appDefinition.getFiles('assets').length) {
            this.loadNextAsset();
            return;
        }

        this.currentFile = 0;
        if (this.appDefinition.getFiles('css').length === 0) {
            this.loadNextJsFile();
            return;
        }
        this.loadNextCssFile();
    }

    loadNextCssFile() {
        let htmlTag = document.createElement("link");
        htmlTag.setAttribute("rel", "stylesheet");
        htmlTag.setAttribute("type", "text/css");
        htmlTag.setAttribute("href", this.buildUrl(this.appDefinition.getFile('css', this.currentFile)));
        htmlTag.onload  = this.cssSuccess.bind(this);
        htmlTag.onerror = this.cssFailed.bind(this);
        document.body.appendChild(htmlTag);
    }

    cssSuccess() {
        this.loadingFileCurrent ++;
        this.displayLoadingBar();

        this.currentFile++;
        if (this.currentFile < this.appDefinition.getFiles('css').length) {
            this.loadNextCssFile();
            return;
        }

        this.currentFile = 0;
        this.loadNextJsFile();
    }

    cssFailed() {
        this.resourceFailed(this.appDefinition.getFile('css', this.currentFile));
    }

    loadNextJsFile() {
        let htmlTag = document.createElement("script");
        htmlTag.setAttribute("type", "text/javascript");
        htmlTag.setAttribute("src", this.buildUrl(this.appDefinition.getFile('js', this.currentFile)));
        htmlTag.onload  = this.jsSuccess.bind(this);
        htmlTag.onerror = this.jsFailed.bind(this);
        document.body.appendChild(htmlTag);
    }

    jsSuccess() {
        this.loadingFileCurrent ++;
        this.displayLoadingBar();

        this.currentFile++;
        if (this.currentFile < this.appDefinition.getFiles('js').length) {
            this.loadNextJsFile();
            return;
        }

        this.currentFile = 0;
        this.startApp();
    }

    jsFailed() {
        this.resourceFailed(this.appDefinition.getFile('js', this.currentFile));
    }

    startApp() {
        let progressBarContainer = document.getElementById('progressBarContainer');
        if (progressBarContainer) {
            progressBarContainer.remove();
        }

        if (this.readyCallback === null) {
            this.logError("No ready callback set - use appBootstrap.setReadyCallback(callback)");
            return;
        }

        this.askStats();

        this.readyCallback();
    }

    async resourceLoad(url) {
        try {
            let response = await fetch(this.buildUrl(url))
            if (response.status >= 200 && response.status < 300) {
                return true;
            }
        } catch {
        }

        this.resourceFailed(url);
        return false;
    }

    resourceFailed(url) {
        this.logError('Error on loading file ' + url);
    }

    displayLoadingBar() {
        let progressBar = document.getElementById('progressBar');
        if (!progressBar) {
            return;
        }

        let percent = Math.floor(100. * (this.loadingFileCurrent / this.loadingFileMax + this.loadingStepCurrent) / this.loadingStepMax);

        progressBar.style.width = percent + '%';
    }

    logDebug(message, context = null) {
        console.log("AppBootstrap - " + message, context);
    }

    logError(message, context = null) {
        console.error("AppBootstrap - " + message, context);
    }
}

var appBootstrap = new AppBootstrap();

document.addEventListener("DOMContentLoaded", () => { appBootstrap.init(); });
