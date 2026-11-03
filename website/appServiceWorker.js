class AppServiceWorker {
    /** @type {WorkerGlobalScope} */ serviceWorker;
    /** @type {Map<string, int>}  */ statsServerFiles;
    /** @type {Map<string, int>}  */ statsCachedSizes;
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
        this.serviceWorker    = serviceWorker;
        this.statsServerFiles = new Map();
        this.statsCachedSizes = new Map();
    }

    initListeners() {
        this.serviceWorker.addEventListener("install",  this.install.bind(this));
        this.serviceWorker.addEventListener("activate", this.activate.bind(this));
        this.serviceWorker.addEventListener("message",  this.message.bind(this));
        this.serviceWorker.addEventListener("fetch",    this.fetch.bind(this));
    }

    install(event) {
        event.waitUntil(this.loadNewVersion());
    }

    activate(event) {
        // Without claim(), the page that registered this worker stays uncontrolled until its next load.
        event.waitUntil(this.serviceWorker.clients.claim());
    }

    message(event) {
        let eventCode = event.data;
        switch (eventCode) {
            case 'clearCache':
                event.waitUntil(this.clearCache());
                break;

            case 'resetStats':
                this.resetStats();
                break;

            case 'askStats':
                event.waitUntil(this.askStats());
                break;

            default:
                this.logDebug('Unknown message', eventCode);
        }
    }

    resetStats() {
        this.statsServerFiles.clear();
    }

    // The weight of the application: what the cache of this version holds, plus what came from the server to go in
    // it and is not there yet — each file once. The requests that bypass the cache (version check, a downloaded data
    // file) are never part of it. Asked by every menu screen: the size of a cached file is read once.
    async askStats() {
        const cache    = await caches.open(this.version);
        const requests = await cache.keys();
        const sizes    = new Map();
        for (const request of requests) {
            if (!this.statsCachedSizes.has(request.url)) {
                this.statsCachedSizes.set(request.url, await AppServiceWorker.bodySize(await cache.match(request)));
            }
            sizes.set(request.url, this.statsCachedSizes.get(request.url));
        }
        for (const [url, size] of this.statsServerFiles) {
            if (!sizes.has(url)) {
                sizes.set(url, size);
            }
        }
        let bytes = 0;
        for (const size of sizes.values()) {
            bytes += size;
        }
        this.triggerEvent(
            'statsAsked',
            {
                'serverFiles': this.statsServerFiles.size,
                'cacheFiles':  requests.length,
                'appBytes':    bytes,
            }
        );
    }

    // Only a response that goes to the cache: an HTTP error never does.
    async recordServerFile(url, response) {
        if (!response.ok) {
            return;
        }
        this.statsServerFiles.set(url, await AppServiceWorker.bodySize(response));
    }

    // The announced length when there is one (what was downloaded): the body is only read without it.
    static async bodySize(response) {
        const length = response.headers.get('content-length');
        if (length !== null) {
            return parseInt(length, 10);
        }

        return (await response.clone().blob()).size;
    }

    async clearCache() {
        this.logDebug(`Clear Cache`);
        await this.deleteOldVersions();
        this.statsCachedSizes.clear();
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

        await Promise.all(
            keys.map(key => {
                this.logDebug(`Deleting version ${key}`);
                return caches.delete(key);
            })
        );
    }

    fetch(event) {
        // Only the GET of the application's own files are cached: a call to another origin (an API) or another
        // method is left to the browser, untouched (cache.put refuses POST and PUT, an API answer must never be replayed).
        if ((event.request.method !== 'GET') || (new URL(event.request.url).origin !== self.location.origin)) {
            return;
        }

        if (event.request.url.indexOf('swBypass=1') !== -1) {
            event.respondWith(fetch(event.request));
            return;
        }

        event.respondWith(
            caches
                .match(event.request)
                .then(
                    (cached) => {
                        if (cached) {
                            return cached;
                        }

                        this.logDebug('Get from server', event.request.url);
                        return fetch(event.request, {cache: "no-store"})
                            .then(response => Promise.all([
                                this.recordServerFile(event.request.url, response),
                                this.putInCache(event.request, response)
                            ]).then(() => response));
                    })
        );
    }

    async putInCache(request, response) {
        // A cached HTTP error would be served until the next version bump; ok is also false for error/opaque types.
        if (!response.ok) {
            return;
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
