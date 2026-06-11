class AppBootstrap {
    /** @type {int}      */ currentFile;
    /** @type {Object}   */ version;
    /** @type {boolean}  */ offline;
    /** @type int        */ loadingStepCurrent
    /** @type int        */ loadingStepMax
    /** @type int        */ loadingFileCurrent
    /** @type int        */ loadingFileMax
    /** @type {boolean}  */ pwaMode;
    /** @type {boolean}  */ pwaDisabled;
    /** @type {string[]} */ definitionUrls;
    /** @type {Function} */ readyCallback;

    constructor() {
        this.pwaDisabled = false;
        this.definitionUrls = [];
        this.readyCallback = null;
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
        return ((this.version) ? this.version.version : '');
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
                this.displayStats(eventContext);
                break;

            default:
                this.logError('Unknown message ' + eventCode, eventContext);
        }
    }

    displayStats(stats) {
        console.log(stats);
        let debug = document.getElementById('appDebug');
        if (debug) {
            debug.innerText = '(Queries: ' + stats.fetchTotal + ' | Server: ' + stats.fetchServer + ' | Cache: ' + stats.fetchCache + ')';
        }
    }

    async checkVersion() {
        this.loadCurrentVersion();
        let serverVersion = await this.loadServerVersion();

        if (this.version === null) {
            if (serverVersion === null) {
                this.offline = true;
                this.logError("You need network connexion to load the app");
                return;
            }

            this.offline = false;
            this.logDebug('OnLine - first install');
            this.saveVersion(serverVersion);
            this.loadApp();
            return;
        }

        if (serverVersion === null) {
            this.offline = true;
            this.logDebug('OffLine Mode');
            this.loadApp();
            return;
        }

        this.offline = false;
        if (this.version.version === serverVersion.version) {
            this.logDebug('OnLine Mode');
            this.loadApp();
            return;
        }

        this.logDebug('Need update');
        this.saveVersion(serverVersion);
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

    versionStorageKey() {
        return "app.version." + this.definitionUrls.join('|');
    }

    loadCurrentVersion() {
        this.version = null;

        let values = localStorage.getItem(this.versionStorageKey());
        if (!values) {
            return;
        }
        this.version = JSON.parse(values);
        if (!(this.version instanceof Object)) {
            this.version = null;
        }
    }

    async loadServerVersion() {
        try {
            let merged = {
                version: [],
                files: {
                    assets: [],
                    css: [],
                    js: []
                }
            };

            for (let url of this.definitionUrls) {
                let response = await fetch(url + '?_=' + (new Date()).getTime());
                let definition = await response.json();

                merged.version.push(definition.version);
                merged.files['assets'] = merged.files['assets'].concat(definition.files['assets']);
                merged.files['css']    = merged.files['css'].concat(definition.files['css']);
                merged.files['js']     = merged.files['js'].concat(definition.files['js']);
            }

            merged.version = merged.version.join('|');
            return merged;
        } catch {
            return null;
        }
    }

    saveVersion(version) {
        this.version = version;
        localStorage.setItem(this.versionStorageKey(), JSON.stringify(version));
    }

    async loadApp() {
        if (this.pwaMode) {
            this.serviceWorker.active.postMessage("resetStats");
        }

        this.loadingStepCurrent = 0;
        this.loadingStepMax     = 1;
        this.loadingFileCurrent = 0;
        this.loadingFileMax     = 0;
        this.loadingFileMax    += this.version.files['assets'].length;
        this.loadingFileMax    += this.version.files['css'].length;
        this.loadingFileMax    += this.version.files['js'].length;
        this.displayLoadingBar();

        this.currentFile = 0;
        if (this.version.files['assets'].length > 0) {
            this.loadNextAsset();
            return;
        }
        if (this.version.files['css'].length > 0) {
            this.loadNextCssFile();
            return;
        }
        this.loadNextJsFile();
    }

    async loadNextAsset() {
        if (await this.resourceLoad(this.version.files['assets'][this.currentFile])) {
            this.assetSuccess();
        }
    }

    assetSuccess() {
        this.loadingFileCurrent ++;
        this.displayLoadingBar();

        this.currentFile++;
        if (this.currentFile < this.version.files['assets'].length) {
            this.loadNextAsset();
            return;
        }

        this.currentFile = 0;
        if (this.version.files['css'].length === 0) {
            this.loadNextJsFile();
            return;
        }
        this.loadNextCssFile();
    }

    loadNextCssFile() {
        let htmlTag = document.createElement("link");
        htmlTag.setAttribute("rel", "stylesheet");
        htmlTag.setAttribute("type", "text/css");
        htmlTag.setAttribute("href", this.buildUrl(this.version.files['css'][this.currentFile]));
        htmlTag.onload  = this.cssSuccess.bind(this);
        htmlTag.onerror = this.cssFailed.bind(this);
        document.body.appendChild(htmlTag);
    }

    cssSuccess() {
        this.loadingFileCurrent ++;
        this.displayLoadingBar();

        this.currentFile++;
        if (this.currentFile < this.version.files['css'].length) {
            this.loadNextCssFile();
            return;
        }

        this.currentFile = 0;
        this.loadNextJsFile();
    }

    cssFailed() {
        this.resourceFailed(this.version.files['css'][this.currentFile]);
    }

    loadNextJsFile() {
        let htmlTag = document.createElement("script");
        htmlTag.setAttribute("type", "text/javascript");
        htmlTag.setAttribute("src", this.buildUrl(this.version.files['js'][this.currentFile]));
        htmlTag.onload  = this.jsSuccess.bind(this);
        htmlTag.onerror = this.jsFailed.bind(this);
        document.body.appendChild(htmlTag);
    }

    jsSuccess() {
        this.loadingFileCurrent ++;
        this.displayLoadingBar();

        this.currentFile++;
        if (this.currentFile < this.version.files['js'].length) {
            this.loadNextJsFile();
            return;
        }

        this.currentFile = 0;
        this.startApp();
    }

    jsFailed() {
        this.resourceFailed(this.version.files['js'][this.currentFile])
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
        this.readyCallback();

        if (this.pwaMode) {
            this.serviceWorker.active.postMessage("askStats");
        }
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

    async displayLoadingBar() {
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
