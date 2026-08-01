/**
 * Screen after "New game": pick the episode, native Doom flow. The episodes
 * are detected from the WAD's level names and named by the game profile
 * (WadRegistry.getEpisodes). The screen always shows, even for a single
 * unnamed episode (MAPxx sets show one bare "Episode 1" entry) — a
 * standardized flow rather than the vanilla Doom II menu skip.
 */
class EpisodeScreen extends AbstractMenuScreen {
    /**
     * @param {MenuNavigator} navigator
     * @param {MenuDisplay}   display
     * @param {WadRegistry}   registry
     */
    constructor(navigator, display, registry) {
        super(navigator, display);

        this._registry = registry;
        this._wadMeta  = null;
    }

    /**
     * @param {object} meta
     */
    setWad(meta) {
        this._wadMeta = meta;

        return this;
    }

    _build() {
        const {panel, listEl} = this._buildWadPanel(this._wadMeta, appTranslator.get('menu.episode.title'));

        this._addStatus(panel);

        this._addBackButton(panel);

        this._loadEpisodes(listEl);
    }

    _onBack() {
        this._navigator.openWadMenu(this._wadMeta);
    }

    // --- Internal ---

    async _loadEpisodes(listEl) {
        this._setStatus(appTranslator.get('menu.episode.reading'));

        let episodes;
        try {
            episodes = await this._registry.getEpisodes(this._wadMeta.id);
        } catch (error) {
            this._showError(error);
            return;
        }

        this._clearStatus();
        this._clearList(listEl);

        if (episodes.length === 0) {
            this._addListEmpty(listEl, appTranslator.get('menu.episode.empty'));
            return;
        }

        for (const episode of episodes) {
            const item = this._addListItem(listEl, this._episodeLabel(episode), () => {
                this._navigator.openDifficulty(this._wadMeta, episode);
            });
            this._addListItemInfos(item, episode.firstLevel);
        }
        this._nav.selectFirst();
    }

    // "Episode {n}", with " - {name}" appended when the profile names it —
    // the number is translated interface text, the name a raw proper noun.
    _episodeLabel(episode) {
        const label = appTranslator.get('menu.episode.item', {episode: episode.episode});

        return ((episode.name !== null) ? (label + ' - ' + episode.name) : label);
    }
}
