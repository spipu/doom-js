class AppServiceWorker {
    /** @type {WorkerGlobalScope} */ serviceWorker;
    /** @type {int}               */ statsFetchTotal;
    /** @type {int}               */ statsFetchServer;
    /** @type {int}               */ statsFetchCache;
    /** @type {boolean}           */ debugEnabled = false;
    /** @type {string}            */ version = "v1";
    /** @type {string[]}          */ files = [
        "/",
        "/js/webapp/appBootstrap.js",
        "/css/main.css",
        "/manifest.webmanifest"
    ];

    /**
     * @param {WorkerGlobalScope} serviceWorker
     */
    constructor(serviceWorker) {
        this.serviceWorker = serviceWorker;
        this.statsFetchTotal  = 0;
        this.statsFetchServer = 0;
        this.statsFetchCache  = 0;
    }

    initListeners() {
        this.serviceWorker.addEventListener("install",  this.install.bind(this));
        this.serviceWorker.addEventListener("activate", this.activate.bind(this));
        this.serviceWorker.addEventListener("message",  this.message.bind(this));
        this.serviceWorker.addEventListener("fetch",    this.fetch.bind(this));
    }

    install(event) {
        event.waitUntil(this.loadNewVersion.bind(this));
    }

    activate(event) {
    }

    message(event) {
        let eventCode = event.data;
        switch (eventCode) {
            case 'clearCache':
                this.clearCache();
                break;

            case 'resetStats':
                this.resetStats();
                break;

            case 'askStats':
                this.askStats();
                break;

            default:
                this.logDebug('Unknown message', eventCode);
        }
    }

    resetStats() {
        this.statsFetchTotal  = 0;
        this.statsFetchServer = 0;
        this.statsFetchCache  = 0;
    }

    askStats() {
        this.triggerEvent(
            'statsAsked',
            {
                'fetchTotal':  this.statsFetchTotal,
                'fetchServer': this.statsFetchServer,
                'fetchCache':  this.statsFetchCache,
            }
        );
    }

    async clearCache() {
        this.logDebug(`Clear Cache`);
        await this.deleteOldVersions();
        await this.loadNewVersion();
        this.logDebug(`Cache Cleared`);
        this.triggerEvent('cacheCleared');
    }

    async loadNewVersion() {
        this.logDebug(`Loading Version`);

        let cache = await caches.open(this.version);
        let urls = this.files;

        const requests = urls.map((url) => new Request(url, {cache: 'no-store'}));
        await cache.addAll(requests);
    }

    async deleteOldVersions() {
        let keys = await caches.keys();

        keys.map(key => {
            this.logDebug(`Deleting version ${key}`);
            caches.delete(key);
        });
    }

    fetch(event) {
        if (event.request.url.indexOf('swBypass=1') !== -1) {
            event.respondWith(fetch(event.request));
            return;
        }

        event.respondWith(
            caches
                .match(event.request)
                .then(
                    (cached) => {
                        this.statsFetchTotal++;

                        if (cached) {
                            this.statsFetchCache++;
                            return cached;
                        }

                        this.logDebug('Get from server', event.request.url);
                        this.statsFetchServer++;
                        return fetch(event.request, {cache: "no-store"});
                    })
                .then(response => this.cache(event.request, response).then(() => response))
        );
    }

    async cache(request, response) {
        if (response.type === "error" || response.type === "opaque") {
            return Promise.resolve();
        }

        return caches
            .open(this.version)
            .then(cache => cache.put(request, response.clone()));
    }

    triggerEvent(eventCode, eventContext = null) {
        this.serviceWorker.clients.matchAll().then(clients => {
            clients.forEach(client => {
                client.postMessage(JSON.stringify({code: eventCode, context: eventContext}));
            });
        });
    }

    logDebug(message, context = null) {
        if (this.debugEnabled) {
            console.log('AppServiceWorker ' + this.version + ' - ' + message, context);
        }
    }
}

let appServiceWorker = new AppServiceWorker(self);
appServiceWorker.initListeners();
