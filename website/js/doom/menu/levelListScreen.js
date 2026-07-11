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
        const {panel, listEl} = this._buildWadPanel(this._wadMeta.name, 'Niveaux');

        this._statusEl = this._addElement('div', 'doom-menu-status', panel);

        const actions = this._addElement('div', 'doom-menu-actions', panel);
        this._addButton('Retour', () => {
            this._navigator.openWad(this._wadMeta);
        }, actions);

        this._loadLevels(listEl);
    }

    // --- Internal ---

    async _loadLevels(listEl) {
        this._setStatus('Lecture du WAD...');

        let levels;
        try {
            levels = await this._registry.getLevels(this._wadMeta.id);
        } catch (error) {
            this._showError(error);
            return;
        }

        this._clearStatus();
        listEl.innerHTML = '';

        if (levels.length === 0) {
            const empty = this._addElement('div', 'doom-menu-empty', listEl);
            empty.textContent = 'Aucun niveau trouvé dans ce WAD';
            return;
        }

        for (const name of levels) {
            this._addListItem(listEl, name, () => {
                this._onSelectLevel(name);
            });
        }
    }

    _onSelectLevel(levelName) {
        this._navigator.startGame(this._wadMeta, levelName);
    }
}
