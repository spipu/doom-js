/**
 * Generic translation catalog: the application adds its catalogs, sets the
 * current language and reads every user-facing text by code.
 *
 * A catalog is a flat map of dotted codes to their translations:
 *   {'menu.back': {fr: 'Retour', en: 'Back'}, …}
 *
 * Parameterised texts carry {placeholders} filled from the params object:
 *   get('menu.loading', {level: 'E1M1'}) → 'Chargement du niveau E1M1'
 *
 * An unknown code returns the code itself, a missing translation falls back to
 * the fallback language, and each problem is logged once.
 */
class AppTranslator {
    constructor() {
        // Prototype-less, so a code named '__proto__' stays a plain entry.
        this._catalog          = Object.create(null);
        this._language         = null;
        this._fallbackLanguage = null;
        this._loggedWarnings   = new Set();
    }

    /**
     * A code declared twice is logged as an authoring mistake; the last one wins.
     *
     * @param {object} catalog - {code: {language: text}}
     */
    addCatalog(catalog) {
        for (const code of Object.keys(catalog)) {
            if (this._catalog[code] !== undefined) {
                console.warn('AppTranslator - translation code [' + code + '] is declared twice');
            }
            this._catalog[code] = catalog[code];
        }

        return this;
    }

    /**
     * @param {string} language - field read in the catalog entries, e.g. 'fr'
     */
    setLanguage(language) {
        this._language = language;

        return this;
    }

    getLanguage() {
        return this._language;
    }

    /**
     * Language used when an entry has no text for the current one.
     *
     * @param {string} language
     */
    setFallbackLanguage(language) {
        this._fallbackLanguage = language;

        return this;
    }

    has(code) {
        return (this._catalog[code] !== undefined);
    }

    /**
     * @param {string} code
     * @param {object} params - {placeholder: value}
     * @returns {string} the code itself when it is unknown
     */
    get(code, params = null) {
        const entry = this._catalog[code];
        if (entry === undefined) {
            this._warnOnce('unknown translation code [' + code + ']');
            return code;
        }

        let text = entry[this._language];
        if (text === undefined) {
            this._warnOnce('code [' + code + '] has no [' + this._language + '] translation');
            text = entry[this._fallbackLanguage];
        }
        if (text === undefined) {
            return code;
        }

        return ((params !== null) ? this._fillPlaceholders(text, params, code) : text);
    }

    /**
     * BCP 47 locale of the current language, for Intl formatting. Falls back to
     * the bare language code, which Intl also accepts.
     *
     * @returns {string} e.g. 'fr-FR'
     */
    getLocale() {
        return (AppTranslator.LOCALES[this._language] ?? this._language);
    }

    // --- Internal ---

    // An absent parameter keeps its {marker}: more telling on screen than 'undefined'.
    _fillPlaceholders(text, params, code) {
        return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (marker, name) => {
            if (params[name] === undefined) {
                this._warnOnce('code [' + code + '] misses the parameter [' + name + ']');
                return marker;
            }
            return String(params[name]);
        });
    }

    // The HUD reads its texts every frame: a repeated warning would flood the console.
    _warnOnce(message) {
        if (this._loggedWarnings.has(message)) {
            return;
        }
        this._loggedWarnings.add(message);
        console.warn('AppTranslator - ' + message);
    }
}

AppTranslator.LOCALES = {
    en: 'en-GB',
    fr: 'fr-FR',
    it: 'it-IT',
    es: 'es-ES'
};

const appTranslator = new AppTranslator();
