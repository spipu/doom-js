/**
 * Finale-text catalogs of the games, fetched once at app startup and merged
 * into the translator.
 *
 * WHICH catalog exists is per-game data: every registered profile contributes
 * its finaleAssets() URL, and all of them are loaded at startup since the WAD
 * (hence the game) is only known later — the same reason doomDecalTextures
 * loads every profile's graphics up front.
 *
 * A catalog is a plain AppTranslator catalog ({code: {fr, en}}) whose codes are
 * namespaced by the profile code ('finale.doom.E1TEXT'), so a file merges as-is
 * and two games sharing a vanilla code (Doom's E1TEXT, Heretic's HE1TEXT) never
 * collide. A game whose WAD carries its own texts (Freedoom, through DEHACKED)
 * declares no catalog.
 *
 * These are third-party texts (see website/assets/uzdoom/). Nothing waits on
 * them: a catalog that fails to load simply leaves its finales silent.
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
     * Translated text of a finale code for a game, or null when neither the
     * catalog nor the language carries it — same lookup-by-code with fallback
     * as the weapon names (HudGameBar._weaponLabel).
     *
     * @param {string} profileCode
     * @param {string} code e.g. 'E1TEXT'
     * @returns {string|null}
     */
    get(profileCode, code) {
        const key = 'finale.' + profileCode + '.' + code;

        return ((appTranslator.has(key)) ? appTranslator.get(key) : null);
    }

    /**
     * Every source writes these texts wrapped for the 1993 fixed screen (~42
     * columns), which reads as ragged half-lines in a modal that reflows on
     * its own. The line breaks INSIDE a paragraph are therefore dropped and
     * the blank lines between paragraphs kept — one rule, wherever the text
     * came from: this catalog, a DEHACKED replacement or a UMAPINFO block.
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

// Global instance (loaded once from doom/main.js), like doomDecalTextures.
const doomFinaleTexts = new DoomFinaleTexts();
