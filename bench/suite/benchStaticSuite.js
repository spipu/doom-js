/**
 * Static checks of the sources, which no run exercises: the translation
 * catalog complete in every language with the same placeholders, every
 * translation code written in the game layer resolvable and every catalog
 * entry used, and both libBootstrap.json consistent with the disk — a file
 * forgotten there is never served, one listed twice is loaded twice.
 */
const fs   = require('fs');
const path = require('path');
const {BenchContext} = require('../lib/benchContext');

class BenchStaticSuite {
    static get name() {
        return 'static';
    }

    /**
     * @param {BenchContext} app
     * @param {{name: string, path: string}[]} wads - unused, the suite reads sources only
     * @param {function(string)} progress
     * @returns {Promise<object>} key "translations/…" | "bootstrap/…" → readable counts and offender lists
     */
    static async run(app, wads, progress) {
        const result = {};
        progress('translations');
        const catalog = app.run('DoomTranslations.CATALOG');
        const sources = BenchStaticSuite._sourcesOf(BenchStaticSuite.TRANSLATED_TREES)
            .filter((file) => (file !== BenchStaticSuite.CATALOG_FILE))
            .map((file) => fs.readFileSync(path.join(BenchContext.WEBSITE, file), 'utf8'))
            .join('\n');
        result['translations/catalog'] = BenchStaticSuite._catalog(catalog);
        result['translations/usage']   = BenchStaticSuite._usage(catalog, sources);

        const declared = new Set();
        for (const bootstrap of BenchContext.BOOTSTRAPS) {
            progress(bootstrap);
            result['bootstrap/' + path.basename(path.dirname(bootstrap))] = BenchStaticSuite._bootstrap(bootstrap, declared);
        }
        result['bootstrap/webapp'] = BenchStaticSuite._webapp(declared);

        return result;
    }

    static _catalog(catalog) {
        const keys         = Object.keys(catalog);
        const languages    = [...new Set(keys.flatMap((key) => Object.keys(catalog[key])))].sort();
        const missing      = [];
        const placeholders = [];
        for (const key of keys) {
            const sets = languages.map((language) => [language, BenchStaticSuite._placeholdersOf(catalog[key][language])]);
            for (const [language, set] of sets) {
                if (set === null) {
                    missing.push(key + ':' + language);
                }
            }
            if (new Set(sets.map(([, set]) => set).filter((set) => (set !== null))).size > 1) {
                placeholders.push(key);
            }
        }

        return {keys: keys.length, languages: languages, missing: missing, placeholders: placeholders};
    }

    static _placeholdersOf(text) {
        if (text === undefined) {
            return null;
        }

        return [...text.matchAll(BenchStaticSuite.PLACEHOLDER)].map((m) => m[1]).sort().join(',');
    }

    static _usage(catalog, sources) {
        const literals = new Set([...sources.matchAll(BenchStaticSuite.CODE_LITERAL)].map((m) => m[1]));
        const prefixes = [...literals].filter((literal) => literal.endsWith('.'));
        const codes    = [...sources.matchAll(BenchStaticSuite.CODE_WRITTEN)].map((m) => (m[1] ?? m[2]));
        const written  = new Set(codes.filter((code) => !code.endsWith('.')));
        const used     = (key) => (literals.has(key) || prefixes.some((prefix) => key.startsWith(prefix)));

        return {
            codes:      written.size,
            unresolved: [...written].filter((code) => (catalog[code] === undefined)).sort(),
            orphans:    Object.keys(catalog).filter((key) => !used(key))
        };
    }

    static _bootstrap(bootstrap, declared) {
        const definition = JSON.parse(fs.readFileSync(path.join(BenchContext.WEBSITE, bootstrap), 'utf8'));
        const files      = Object.values(definition.files).flat();
        const tree       = path.dirname(bootstrap);
        const seen       = new Set();
        const duplicates = [];
        for (const file of files) {
            if (seen.has(file)) {
                duplicates.push(file);
            }
            seen.add(file);
            declared.add(file);
        }

        return {
            versionValid: BenchStaticSuite.VERSION.test(definition.version),
            declared:     files.length,
            missing:      files.filter((file) => !fs.existsSync(path.join(BenchContext.WEBSITE, file))),
            duplicates:   duplicates,
            undeclared:   BenchStaticSuite._sourcesOf([tree]).filter((file) => !seen.has(file))
        };
    }

    static _webapp(declared) {
        const sources = BenchStaticSuite._sourcesOf([BenchStaticSuite.WEBAPP_TREE])
            .filter((file) => !BenchStaticSuite.PRECACHED_ONLY.includes(file));

        return {files: sources.length, undeclared: sources.filter((file) => !declared.has(file))};
    }

    /**
     * @param {string[]} trees - website-relative directories
     * @returns {string[]} the .js files beneath, as the bootstraps spell them ("/js/…")
     */
    static _sourcesOf(trees) {
        const walk = (dir) => fs.readdirSync(path.join(BenchContext.WEBSITE, dir), {withFileTypes: true})
            .flatMap((entry) => (entry.isDirectory()
                ? walk(dir + '/' + entry.name)
                : ((entry.name.endsWith('.js')) ? ['/' + dir + '/' + entry.name] : [])));

        return trees.flatMap(walk).sort();
    }
}

BenchStaticSuite.TRANSLATED_TREES = ['js/doom', 'js/webapp'];
BenchStaticSuite.WEBAPP_TREE      = 'js/webapp';
BenchStaticSuite.CATALOG_FILE     = '/js/doom/doomTranslations.js';
BenchStaticSuite.PRECACHED_ONLY   = ['/js/webapp/appBootstrap.js', '/js/webapp/appServiceWorker.js'];
BenchStaticSuite.PLACEHOLDER      = /\{([a-zA-Z0-9_]+)\}/g;
BenchStaticSuite.CODE_LITERAL     = /'([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]*)+)'/g;
BenchStaticSuite.CODE_WRITTEN     = /appTranslator\.get\('([^']+)'|[a-z][a-zA-Z]*Code: *'([^']*\.[^']*)'/g;
BenchStaticSuite.VERSION          = /^v\d+\.\d+$/;

module.exports = {BenchStaticSuite};
