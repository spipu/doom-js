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

        const {panel, listEl} = this._buildPanel('Fichiers WAD');
        this._listEl = listEl;

        const helpButton = MenuDom.addButton(this._container, 'doom-menu-help-button', '?', () => {
            this._openHelp();
        });
        this._nav.setSideButton(helpButton, () => {
            this._openHelp();
        });

        this._buildAddForm(panel);

        this._addStatus(panel);

        this._refresh();
    }

    // --- Build ---

    _buildAddForm(panel) {
        const form = this._addElement('div', 'doom-menu-form', panel);

        this._urlInput = this._addElement('input', 'doom-menu-input', form);
        this._urlInput.type = 'text';
        this._urlInput.placeholder = 'https://exemple.com/fichier.wad';
        this._urlInput.addEventListener('keydown', (event) => {
            if ((event.code === 'Enter') || (event.code === 'NumpadEnter')) {
                event.preventDefault();
                this._onAddUrl();
            }
        });

        this._buttons.push(this._addButton('Ajouter par URL', () => {
            this._onAddUrl();
        }, form));

        this._fileInput = this._addElement('input', 'doom-menu-file-input', form);
        this._fileInput.type = 'file';
        this._fileInput.accept = '.wad';
        this._fileInput.addEventListener('change', (event) => {
            this._onAddFile(event);
        });

        this._buttons.push(this._addButton('Fichier local', () => {
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
            this._addListEmpty(this._listEl, 'Aucun WAD — ajoutez-en un ci-dessous');
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

        this._addListItemInfos(item, this._formatSize(meta.size) + ' — ' + this._formatDate(meta.addedAt));

        const deleteButton = MenuDom.addButton(item, 'doom-menu-item-delete', '✕', (event) => {
            event.stopPropagation();
            this._onDeleteWad(meta);
        });
        deleteButton.title = 'Supprimer';
    }

    // --- Handlers ---

    async _onAddUrl() {
        const url = WadRegistry.normalizeUrl(this._urlInput.value);
        if (url === '') {
            this._setError('Saisissez une URL');
            return;
        }
        this._urlInput.value = url;

        this._setBusy(true);
        this._setStatus('Téléchargement...');
        try {
            const meta = await this._registry.addFromUrl(url);
            this._urlInput.value = '';
            this._setStatus(meta.name + ' ajouté');
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
        this._setStatus('Lecture du fichier...');
        try {
            const meta = await this._registry.addFromFile(file);
            this._setStatus(meta.name + ' ajouté');
            await this._refresh();
        } catch (error) {
            this._showError(error);
        }
        this._fileInput.value = '';
        this._setBusy(false);
    }

    _onDeleteWad(meta) {
        this._confirm('Supprimer ' + meta.name + ' ?', async () => {
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
        this._navigator.openWad(meta);
    }

    _openHelp() {
        new MenuHelpModal(this._display).show();
    }

    // --- Internal ---

    _setBusy(busy) {
        for (const button of this._buttons) {
            button.disabled = busy;
        }
    }
}
