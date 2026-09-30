/**
 * The lobby of a session: its players in slot order with their ping and, in
 * cooperative, the colour of their slot, updated live. The main adds a player (greyed out once the lobby is full), removes a
 * sub by picking its line, and starts; a sub only sees the list — and that the
 * game runs on the main — and can leave.
 */
class MenuLobbyModal extends AbstractMenuListModal {
    /**
     * @param {MenuDisplay} display
     */
    constructor(display) {
        super(display);

        this._session  = null;
        this._isMain   = false;
        this._actions  = null;
        this._titleEl  = null;
        this._listEl   = null;
        this._statusEl = null;
        this._shape    = null;
        this._pingEls  = new Map();   // player id → its ping element
        this._itemKeys = [];          // what each list entry stands for, to keep the selection on it
    }

    /**
     * @param {DoomNetMainSession} session
     * @param {{addPlayer: function, start: function}} actions
     */
    openMain(session, actions) {
        this._isMain = true;

        return this._open(session, actions, appTranslator.get('menu.back'));
    }

    /**
     * @param {DoomNetSubSession}  session
     * @param {{leave: function}} actions
     */
    openSub(session, actions) {
        this._isMain = false;

        return this._open(session, actions, appTranslator.get('multiplayer.lobby.leave'));
    }

    _open(session, actions, buttonLabel) {
        this._session = session;
        this._actions = actions;
        const {titleEl, bodyEl} = this._openShell('', buttonLabel);
        this._titleEl  = titleEl;
        this._listEl   = MenuDom.addElement(bodyEl, 'div', 'doom-menu-list');
        this._statusEl = MenuDom.addElement(bodyEl, 'div', 'doom-menu-status');
        this._shape    = null;
        session.setOnChange(() => this._refresh());
        this._refresh();
        this._nav.selectFirst();

        return this;
    }

    _teardown() {
        if (this._session !== null) {
            this._session.setOnChange(null);
        }
    }

    _onBack() {
        if (!this._isMain) {
            this._actions.leave();
        }
        this.close();
    }

    // A new player list is rebuilt; a ping sample only rewrites the pings.
    _refresh() {
        const lobby = this._session.getLobby();
        const shape = JSON.stringify([lobby.getPlayers().map((player) => [player.id, player.color]), this._session.isStarted()]);
        this._titleEl.textContent = appTranslator.get('multiplayer.lobby.title', {count: lobby.getPlayers().length, capacity: lobby.getCapacity()});
        if (shape !== this._shape) {
            this._shape = shape;
            this._rebuild(lobby);
            return;
        }
        for (const player of lobby.getPlayers()) {
            const pingEl = this._pingEls.get(player.id);
            if (pingEl !== undefined) {
                pingEl.textContent = this._pingText(player);
            }
        }
    }

    // The selection stays on the entry it was on: a player joining must not
    // slide it from "Add a player" onto a line that removes someone.
    _rebuild(lobby) {
        const selected = (this._itemKeys[this._nav.getSelectedIndex()] ?? null);
        this._listEl.innerHTML = '';
        this._nav.clear();
        this._pingEls.clear();
        this._itemKeys = [];
        for (const player of lobby.getPlayers()) {
            this._addPlayer(player);
        }
        if (this._isMain) {
            this._addMainActions(lobby);
        }
        this._statusEl.textContent = (((!this._isMain) && this._session.isStarted()) ? appTranslator.get('multiplayer.lobby.inProgress') : '');
        if (selected !== null) {
            this._nav.selectIndex(Math.max(0, this._itemKeys.indexOf(selected)));
        }
    }

    _addPlayer(player) {
        const label = appTranslator.get('multiplayer.lobby.player', {slot: player.slot, nickname: player.nickname});
        const item  = this._nav.addItemIn(this._listEl, label, () => this._pickPlayer(player));
        if (player.color !== null) {
            MenuDom.addColorSwatch(item, player.color);
        }
        this._pingEls.set(player.id, MenuDom.addText(item, 'doom-menu-item-infos', this._pingText(player)));
        this._itemKeys.push(player.id);
    }

    _addMainActions(lobby) {
        const add = this._nav.addItemIn(this._listEl, appTranslator.get('multiplayer.lobby.add'), () => this._addPlayerIfRoom());
        if (lobby.isFull()) {
            add.classList.add('doom-menu-item-disabled');
        }
        this._nav.addItemIn(this._listEl, appTranslator.get('multiplayer.lobby.start'), () => this._actions.start());
        this._itemKeys.push(MenuLobbyModal.KEY_ADD, MenuLobbyModal.KEY_START);
    }

    _addPlayerIfRoom() {
        if (this._session.getLobby().isFull()) {
            doomSound.playUi('menu/invalid');
            return;
        }
        this._actions.addPlayer();
    }

    // The main removes a sub by picking its line; nothing else reacts.
    _pickPlayer(player) {
        if (!this._isMain || (player.id === DoomNetLobby.MAIN_ID)) {
            return;
        }
        this._confirm(appTranslator.get('multiplayer.lobby.removeConfirm', {nickname: player.nickname}),
            () => this._session.remove(player.id), appTranslator.get('multiplayer.lobby.remove'));
    }

    _pingText(player) {
        if (player.id === DoomNetLobby.MAIN_ID) {
            return appTranslator.get('multiplayer.lobby.main');
        }
        if (player.ping === null) {
            return appTranslator.get('multiplayer.lobby.pingPending');
        }
        const ping = new Intl.NumberFormat(appTranslator.getLocale(), {maximumFractionDigits: 0}).format(player.ping);

        return appTranslator.get('multiplayer.lobby.ping', {ping: ping});
    }
}

MenuLobbyModal.KEY_ADD   = 'add';
MenuLobbyModal.KEY_START = 'start';
