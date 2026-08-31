/**
 * Screen 1: list of the stored WAD files, with add (url or local file) and delete.
 */
class WadListScreen extends AbstractMenuScreen {
    /**
     * @param {MenuNavigator} navigator
     * @param {MenuDisplay}   display
     * @param {WadRegistry}   registry
     */
    constructor(navigator, display, registry) {
        super(navigator, display);

        this._registry  = registry;
        this._listEl        = null;
        this._urlInput      = null;
        this._fileInput     = null;
        this._buttons       = [];
        this._languageButton = null;
    }

    _build() {
        this._listEl    = null;
        this._urlInput  = null;
        this._fileInput = null;
        this._buttons   = [];

        const {panel, listEl} = this._buildPanel(appTranslator.get('menu.wad.title'));
        this._listEl = listEl;

        const corner = this._addElement('div', 'doom-menu-corner');
        this._languageButton = MenuDom.addButton(corner, 'doom-menu-button doom-menu-language',
            doomSettings.getListLabel(this._languageDefinition()),
            () => this._cycleLanguage());
        this._nav.setSideButtons([
            this._languageButton,
            MenuDom.addButton(corner, 'doom-menu-button', appTranslator.get('help.guide'),
                () => this._openHelp())
        ]);

        this._buildAddForm(panel);

        this._addStatus(panel);

        this._refresh();
    }

    // --- Build ---

    _buildAddForm(panel) {
        const form = this._addElement('div', 'doom-menu-form', panel);

        this._urlInput = this._addElement('input', 'doom-menu-input', form);
        this._urlInput.type = 'text';
        this._urlInput.placeholder = appTranslator.get('menu.wad.urlPlaceholder');
        this._urlInput.addEventListener('keydown', (event) => {
            if ((event.code === 'Enter') || (event.code === 'NumpadEnter')) {
                event.preventDefault();
                addUrlButton.click();
            }
        });

        const addUrlButton = this._addButton(appTranslator.get('menu.wad.addUrl'), () => {
            this._onAddUrl();
        }, form);
        this._buttons.push(addUrlButton);

        this._fileInput = this._addElement('input', 'doom-menu-file-input', form);
        this._fileInput.type = 'file';
        this._fileInput.accept = '.wad';
        this._fileInput.addEventListener('change', (event) => {
            this._onAddFile(event);
        });

        this._buttons.push(this._addButton(appTranslator.get('menu.wad.addFile'), () => {
            this._fileInput.click();
        }, form));
    }

    async _refresh() {
        let list;
        try {
            list = await this._registry.getList();
        } catch (error) {
            this._showError(error);
            return;
        }

        this._clearList(this._listEl);

        if (list.length === 0) {
            this._addListEmpty(this._listEl, appTranslator.get('menu.wad.empty'));
            MenuDom.addText(this._listEl, 'doom-menu-empty-hint', appTranslator.get('menu.wad.emptyHint'));
            MenuDom.addText(this._listEl, 'doom-menu-empty-hint', appTranslator.get('menu.wad.emptyHintHelp'));
            MenuDom.addText(this._listEl, 'doom-menu-empty-hint', appTranslator.get('menu.wad.emptyHintSteps', {
                help: appTranslator.get('help.guide')
            }));
            return;
        }

        for (const meta of list) {
            this._buildItem(meta);
        }
        this._nav.selectFirst();
    }

    _buildItem(meta) {
        const item = this._addListItem(this._listEl, meta.name, () => {
            this._onSelectWad(meta);
        });

        this._addListItemInfos(item, MenuDom.formatSize(meta.size) + ' — ' + MenuDom.formatDate(meta.addedAt));

        MenuDom.addDeleteButton(item, appTranslator.get('menu.wad.delete'), () => {
            this._onDeleteWad(meta);
        });
    }

    // --- Handlers ---

    async _onAddUrl() {
        const url = WadRegistry.normalizeUrl(this._urlInput.value);
        if (url === '') {
            this._setError(appTranslator.get('menu.wad.urlMissing'));
            return;
        }
        this._urlInput.value = url;

        this._setBusy(true);
        this._setStatus(appTranslator.get('menu.wad.downloading'));
        try {
            const meta = await this._registry.addFromUrl(url);
            this._urlInput.value = '';
            this._setStatus(appTranslator.get('menu.wad.added', {wad: meta.name}));
            await this._refresh();
        } catch (error) {
            this._showError(error);
        }
        this._setBusy(false);
    }

    async _onAddFile(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        this._setBusy(true);
        this._setStatus(appTranslator.get('menu.wad.reading'));
        try {
            const meta = await this._registry.addFromFile(file);
            this._setStatus(appTranslator.get('menu.wad.added', {wad: meta.name}));
            await this._refresh();
        } catch (error) {
            this._showError(error);
        }
        this._fileInput.value = '';
        this._setBusy(false);
    }

    _onDeleteWad(meta) {
        this._confirm(appTranslator.get('menu.wad.deleteConfirm', {wad: meta.name}), async () => {
            try {
                await this._registry.remove(meta.id);
                this._clearStatus();
                await this._refresh();
            } catch (error) {
                this._showError(error);
            }
        });
    }

    _onSelectWad(meta) {
        this._navigator.openWadMenu(meta);
    }

    // Cycles the UI language and rebuilds the screen: every label is built
    // once, so nothing short of a rebuild follows the new language.
    _cycleLanguage() {
        const definition = this._languageDefinition();
        doomSettings
            .set(definition.key, doomSettings.nextListValue(definition))
            .applyToTranslator(appTranslator);

        // The rebuild drops every highlight: hand it back to the button just
        // pressed, so changing language twice in a row needs no re-aiming.
        this.show();
        this._nav.focusSideButton(this._languageButton);
    }

    _languageDefinition() {
        return doomSettings.getDefinition(WadListScreen.LANGUAGE_KEY);
    }

    // --- Internal ---

    _setBusy(busy) {
        for (const button of this._buttons) {
            button.disabled = busy;
        }
    }
}

WadListScreen.LANGUAGE_KEY = 'display.language';
