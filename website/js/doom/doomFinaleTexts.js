/**
 * Finale-text catalogs of the games (profile finaleAssets()), all fetched at
 * startup since the game is only known once a WAD is chosen, and merged into
 * the translator.
 *
 * Codes are namespaced by profile ('finale.doom.E1TEXT') so two games never
 * collide. A game whose WAD carries its own texts (Freedoom, through DEHACKED)
 * declares no catalog. Third-party texts: see website/assets/uzdoom/.
 */
class DoomFinaleTexts {
    load() {
        const seen = new Set();
        for (const profile of new GameProfileList().getAll()) {
            const url = profile.finaleAssets();
            if ((url === null) || seen.has(url)) {
                continue;
            }
            seen.add(url);
            appBootstrap.fetchJson(url, (catalog) => appTranslator.addCatalog(catalog));
        }
    }

    /**
     * @param {string} profileCode
     * @param {string} code e.g. 'E1TEXT'
     * @returns {string|null} null when no catalog carries the code
     */
    get(profileCode, code) {
        const key = 'finale.' + profileCode + '.' + code;

        return ((appTranslator.has(key)) ? appTranslator.get(key) : null);
    }

    /**
     * The sources wrap these texts for the ~42-column vanilla screen: the line
     * breaks inside a paragraph are dropped so the modal can reflow them.
     *
     * @param {string} text
     * @returns {string}
     */
    static reflow(text) {
        return text.split(/\n\s*\n/)
            .map((paragraph) => paragraph.split('\n').map((line) => line.trim()).join(' ').trim())
            .filter((paragraph) => (paragraph !== ''))
            .join('\n\n');
    }
}

const doomFinaleTexts = new DoomFinaleTexts();
