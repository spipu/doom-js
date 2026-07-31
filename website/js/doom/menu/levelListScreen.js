/**
 * Screen 2: list of the levels of a WAD file.
 */
class LevelListScreen extends AbstractMenuScreen {
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
        const {panel, listEl} = this._buildWadPanel(this._wadMeta.name, appTranslator.get('menu.level.title'));

        this._addStatus(panel);

        this._addBackButton(panel);

        this._loadLevels(listEl);
    }

    _onBack() {
        this._navigator.openWad(this._wadMeta);
    }

    // --- Internal ---

    async _loadLevels(listEl) {
        this._setStatus(appTranslator.get('menu.level.reading'));

        let levels;
        try {
            levels = await this._registry.getLevels(this._wadMeta.id);
        } catch (error) {
            this._showError(error);
            return;
        }

        this._clearStatus();
        this._clearList(listEl);

        if (levels.length === 0) {
            this._addListEmpty(listEl, appTranslator.get('menu.level.empty'));
            return;
        }

        for (const name of levels) {
            this._addListItem(listEl, name, () => {
                this._onSelectLevel(name);
            });
        }
        this._nav.selectFirst();
    }

    _onSelectLevel(levelName) {
        this._navigator.startGame(this._wadMeta, levelName);
    }
}
