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
        this._listEl    = null;
        this._urlInput  = null;
        this._fileInput = null;
        this._buttons   = [];
    }

    _build() {
        this._listEl    = null;
        this._urlInput  = null;
        this._fileInput = null;
        this._buttons   = [];

        const {panel, listEl} = this._buildPanel(appTranslator.get('menu.wad.title'));
        this._listEl = listEl;

        const aboutButton = MenuDom.addButton(this._container, 'doom-menu-button doom-menu-help-button', '?', () => {
            this._openAbout();
        });
        this._nav.setSideButton(aboutButton);

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

    _openAbout() {
        this._openModal(new MenuOptionsModal(this._display)).showAbout();
    }

    // --- Internal ---

    _setBusy(busy) {
        for (const button of this._buttons) {
            button.disabled = busy;
        }
    }
}
