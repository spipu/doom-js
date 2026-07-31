/**
 * Generic translation catalog of the webapp — reusable in any project, with no
 * knowledge of the games, the screens or the languages it serves.
 *
 * The application stacks its catalogs (addCatalog), pushes the current language
 * (setLanguage) and reads every user-facing text through a CODE (get): the code
 * is what lives in the calling code, so a text exists in exactly one place and a
 * new language is one more field per entry, never a sweep of the call sites.
 *
 * A catalog is a flat map of dotted codes to their translations:
 *   {'menu.back': {fr: 'Retour', en: 'Back'}, …}
 *
 * Parameterised texts carry {placeholders} filled from the params object:
 *   get('menu.loading', {level: 'E1M1'}) → 'Chargement du niveau E1M1'
 *
 * Nothing is ever silently empty: a missing code returns the code itself (so the
 * hole shows on screen instead of a blank), a missing translation falls back to
 * the fallback language, and each problem is logged ONCE — a text read every
 * frame must not flood the console.
 */
class AppTranslator {
    constructor() {
        // Prototype-less map: a catalog is data, possibly built elsewhere, and a
        // code named '__proto__' must be an entry — never a prototype change.
        this._catalog  = Object.create(null);
        this._language = null;
        this._fallback = null;
        this._warned   = new Set();
    }

    /**
     * Merge a catalog into the registry. A code declared twice is an authoring
     * mistake (two owners for one text), not an override: the last one wins and
     * says so.
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
     * Language every get() answers in. Unknown to this class: it is just the
     * field name read in the catalog entries.
     *
     * @param {string} language - e.g. 'fr'
     */
    setLanguage(language) {
        this._language = language;

        return this;
    }

    getLanguage() {
        return this._language;
    }

    /**
     * Language used when an entry has no text for the current one — the
     * reference language of the catalog.
     *
     * @param {string} language
     */
    setFallbackLanguage(language) {
        this._fallback = language;

        return this;
    }

    /**
     * @param {string} code
     * @returns {boolean} true when the catalog carries that code
     */
    has(code) {
        return (this._catalog[code] !== undefined);
    }

    /**
     * Translated text of a code, with its {placeholders} filled.
     *
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
            text = entry[this._fallback];
        }
        if (text === undefined) {
            return code;
        }

        return ((params !== null) ? this._fillPlaceholders(text, params, code) : text);
    }

    /**
     * BCP 47 locale of the current language, for the formatting the platform
     * owns (dates, numbers) rather than the catalog: toLocaleDateString,
     * Intl.NumberFormat… Falls back to the language code itself, which the Intl
     * API accepts for a bare language.
     *
     * @returns {string} e.g. 'fr-FR'
     */
    getLocale() {
        return (AppTranslator.LOCALES[this._language] ?? this._language);
    }

    // --- Internal ---

    // {name} → params.name. An absent parameter leaves its marker in place: a
    // visible {level} is a readable bug, 'undefined' is not.
    _fillPlaceholders(text, params, code) {
        return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (marker, name) => {
            if (params[name] === undefined) {
                this._warnOnce('code [' + code + '] misses the parameter [' + name + ']');
                return marker;
            }
            return String(params[name]);
        });
    }

    // One log per distinct problem: these paths run on every render (and on
    // every frame for the HUD), so repeating would bury everything else.
    _warnOnce(message) {
        if (this._warned.has(message)) {
            return;
        }
        this._warned.add(message);
        console.warn('AppTranslator - ' + message);
    }
}

AppTranslator.LOCALES = {
    fr: 'fr-FR',
    en: 'en-GB'
};

// Global instance, like appBootstrap and loader.
const appTranslator = new AppTranslator();
