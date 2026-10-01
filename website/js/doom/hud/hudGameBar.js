/**
 * Graphical game HUD, a DOM/CSS overlay of our own (no WAD lumps) laid out in
 * the screen corners over the letterboxed display:
 *   - bottom-left : running power-ups, health and armor bars
 *   - bottom-right: ammo of the active weapon ('—' if none)
 *   - top-left    : key pips (lit when owned), secret and kill counts — or,
 *                   when the rules score the frags, the match clock and every
 *                   player's frags in slot order, each behind its colour, the
 *                   viewed player's in bold
 *   - top-right   : weapon slots + active weapon name
 *   - bottom-centre: optional fps readout, with the ping during a session
 *
 * Sizes are in cqh on a size container, so the whole bar follows the letterbox
 * height.
 */
class HudGameBar extends AbstractHud {
    constructor(engine) {
        super(engine);
        this._profile     = null;
        this._itemCatalog = null;
        this._stats       = null;
        this._rules       = null;
        this._bodies      = null;   // the level's body views, the players' among them
        this._slotColors  = [];
        this._pingSource  = null;
        this._root        = null;
        this._els         = {};
        this._keyEls      = {};
        this._armsEls     = {};
        this._effectEls   = {};
        this._fragRows    = [];     // {row, swatch, value} per player shown, built on demand
    }

    bindProfile(profile) {
        this._profile = profile;
        return this;
    }

    bindItemCatalog(itemCatalog) {
        this._itemCatalog = itemCatalog;
        return this;
    }

    bindLevelStats(stats) {
        this._stats = stats;
        return this;
    }

    // The game mode's rules: whether frags are scored and keys worth showing.
    bindRules(rules) {
        this._rules = rules;
        return this;
    }

    /**
     * @param {Set<DoomBodyView>} bodies     - the level's body views: the players' tell who is in the level
     * @param {string[]}          slotColors - CSS colour per slot, index 0 = slot 1
     */
    bindPlayerBodies(bodies, slotColors) {
        this._bodies     = bodies;
        this._slotColors = slotColors;
        return this;
    }

    // Null outside a session: the readout then shows the fps alone.
    bindPingSource(source) {
        this._pingSource = source;
        return this;
    }

    init(container) {
        super.init(container);

        this._root = this._createEl('div', {
            position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
            pointerEvents: 'none', fontFamily: 'system-ui, sans-serif', color: '#fff',
            containerType: 'size'
        });
        container.appendChild(this._root);

        this._buildHealthArmor();
        this._buildAmmo();
        this._buildKeys();
        this._buildArms();
        this._buildFps();
    }

    // The debug view carries its own fps line: this one serves the game view.
    _buildFps() {
        const block = this._createEl('div', this._cornerStyle({bottom: '1em', left: '50%'}));
        block.style.transform = 'translateX(-50%)';
        block.style.display   = 'none';

        this._els.fpsBlock = block;
        this._els.fpsValue = this._createEl('div', {fontSize: '0.8em', fontWeight: '700', color: '#ccc'});
        block.appendChild(this._els.fpsValue);
        this._root.appendChild(block);
    }

    setVisible(visible) {
        if (this._root !== null) {
            this._root.style.display = ((visible) ? 'block' : 'none');
        }
    }

    update() {
        if ((this._user === null) || (this._root === null)) {
            return;
        }

        const user = this._user;

        const energy    = user.getEnergy();
        const maxEnergy = user.getMaxEnergy();
        this._els.healthFill.style.width = this._ratioPct(energy, maxEnergy);
        this._els.healthValue.innerText  = String(Math.ceil(energy));

        // Armor — value + bar coloured by the armour tier (green ⅓, blue ½)
        const armor      = user.getArmor();
        const maxArmor   = user.getMaxArmor();
        const armorColor = ((user.getArmorAbsorb() >= 0.5) ? '#4d9fff' : '#5dd35d');
        this._els.armorFill.style.width           = this._ratioPct(armor, maxArmor);
        this._els.armorFill.style.backgroundColor = armorColor;
        this._els.armorValue.innerText            = String(Math.ceil(armor));

        this._updateAmmo(user);
        this._updateArms(user);
        this._updateKeys(user);
        this._updateEffects(user);
        this._updateScores(user);

        this._updateFps();
    }

    // Read every frame, like the crosshair: a toggle from the options, which the
    // pause menu reaches mid-level, applies without reloading.
    _updateFps() {
        const visible = doomSettings.getDisplayShowFps();
        this._els.fpsBlock.style.display = ((visible) ? 'block' : 'none');
        if (!visible) {
            return;
        }
        const fps  = this._engine.getFps();
        const ping = ((this._pingSource !== null) ? this._pingSource() : null);
        this._els.fpsValue.innerText = ((ping !== null)
            ? appTranslator.get('hud.fpsPing', {value: fps, ping: Math.round(ping)})
            : appTranslator.get('hud.fps', {value: fps}));
    }

    _updateAmmo(user) {
        const code   = user.getActiveWeapon();
        const weapon = this._itemCatalog.getWeapon(code);
        const type   = ((weapon !== null) ? weapon.getAmmoType() : null);
        this._els.ammoValue.innerText = ((type === null) ? '—' : user.getAmmo(type) + '/' + user.getAmmoMax(type));
    }

    _updateArms(user) {
        const slots        = this._profile.hudWeaponSlots();
        const slotByWeapon = slots.byWeapon;
        const code         = user.getActiveWeapon();
        const activeSlot   = (slotByWeapon[code] ?? null);

        const ownedCodes = new Set(user.getOwnedWeaponCodes());
        const ownedSlots = new Set();
        for (const owned of ownedCodes) {
            const slot = slotByWeapon[owned];
            if (slot !== undefined) {
                ownedSlots.add(slot);
            }
        }

        for (let slot = 1; slot <= slots.count; slot++) {
            const el       = this._armsEls[slot];
            const isActive = (slot === activeSlot);
            // The always-owned slot (Doom fist / Heretic staff) is always lit.
            const isOwned  = ((slot === slots.alwaysOwnedSlot) ? true : ownedSlots.has(slot));
            el.style.color      = ((isActive) ? '#111' : ((isOwned) ? '#fff' : '#555'));
            el.style.background = ((isActive) ? '#ffcc00' : 'transparent');
            // That slot gets a green accent border when its upgrade weapon is
            // owned (Doom chainsaw / Heretic gauntlets — name shows it active).
            if (slot === slots.alwaysOwnedSlot) {
                el.style.borderColor = ((!isActive && ownedCodes.has(slots.upgradeWeapon)) ? '#5dd35d' : 'rgba(255, 255, 255, 0.25)');
            }
        }

        const weapon = this._itemCatalog.getWeapon(code);
        this._els.weaponName.innerText = ((weapon !== null) ? this._weaponLabel(code, weapon) : '—');
    }

    // A weapon from a profile with no catalog entry keeps its transcribed name,
    // rather than showing its translation code.
    _weaponLabel(code, weapon) {
        const translationCode = 'weapon.' + code;

        return ((appTranslator.has(translationCode)) ? appTranslator.get(translationCode) : weapon.getName());
    }

    // Timed power-ups blink in sync with their screen effect near the end;
    // the blink uses visibility, not display, so the stack keeps its height.
    _updateEffects(user) {
        const effects = user.getEffects();
        for (const effectLine of HudGameBar.EFFECT_LINES) {
            const el          = this._effectEls[effectLine.code];
            const remainingMs = effects[effectLine.code];
            const active      = ((effectLine.timed) ? (remainingMs !== undefined) : user.hasItem(effectLine.code));
            el.style.display = ((active) ? 'block' : 'none');
            if (!active) {
                continue;
            }
            if (effectLine.timed) {
                el.innerText = appTranslator.get(effectLine.labelCode) + ' ' + MenuDom.formatClock(Math.ceil(remainingMs / 1000), 1);
                el.style.visibility = ((user.isEffectVisible(effectLine.code)) ? 'visible' : 'hidden');
            } else {
                el.innerText = appTranslator.get(effectLine.labelCode);
            }
        }
    }

    // Every player of a deathmatch holds every key: the pips would say nothing.
    _updateScores(user) {
        const scoresFrags = ((this._rules !== null) && this._rules.scoresFrags());
        const keysShown   = ((this._rules === null) || !this._rules.givesAllKeys());
        this._els.keysRow.style.display = ((keysShown) ? 'flex' : 'none');
        this._els.scores.style.display  = ((scoresFrags) ? 'none' : 'block');
        this._els.frags.style.display   = ((scoresFrags) ? 'block' : 'none');
        if (scoresFrags) {
            this._updateMatchClock();
            this._updateFragRows(user.getPlayerId());
            return;
        }
        this._els.secretsValue.innerText = this._stats.getSecretsFound() + '/' + this._stats.getSecretsTotal();
        this._els.killsValue.innerText   = this._stats.getKillsCount() + '/' + this._stats.getKillsTotal();
    }

    // Counting down to the time limit when the rules set one, up otherwise.
    _updateMatchClock() {
        const limit   = this._rules.timeLimitMs();
        const matchMs = this._stats.getMatchTimeMs();
        const seconds = ((limit !== null) ? Math.ceil(Math.max(0, limit - matchMs) / 1000) : Math.floor(matchMs / 1000));
        this._els.matchClock.innerText = MenuDom.formatClock(seconds, 2);
    }

    // Every player in the level, in slot order; a row more is built only when
    // a player more is there.
    _updateFragRows(ownId) {
        const ids = [];
        for (const view of (this._bodies ?? [])) {
            const id = view.getPlayerId();
            if (id !== null) {
                ids.push(id);
            }
        }
        ids.sort((a, b) => (a - b));
        while (this._fragRows.length < ids.length) {
            this._fragRows.push(this._buildFragRow());
        }
        this._fragRows.forEach((entry, i) => {
            const id = (ids[i] ?? null);
            entry.row.style.display = ((id !== null) ? 'flex' : 'none');
            if (id !== null) {
                entry.row.style.fontWeight         = ((id === ownId) ? '800' : '400');
                entry.swatch.style.backgroundColor = (this._slotColors[id - 1] ?? 'transparent');
                entry.value.innerText              = String(this._stats.fragScore(id));
            }
        });
    }

    _updateKeys(user) {
        const keyColors = this._profile.hudKeyColors();
        const owned     = new Set(user.getItemCodes());
        for (const key of Object.keys(keyColors)) {
            const el  = this._keyEls[key];
            const lit = owned.has(key);
            el.style.backgroundColor = ((lit) ? keyColors[key] : 'transparent');
            el.style.opacity         = ((lit) ? '1' : '0.25');
        }
    }

    // --- Build ---

    _buildHealthArmor() {
        const block = this._createEl('div', this._cornerStyle({ bottom: '1em', left: '1em' }));

        this._els.effects = this._createEl('div', {
            marginBottom: '0.35em', fontSize: '0.8em', fontWeight: '700'
        });
        for (const effectLine of HudGameBar.EFFECT_LINES) {
            const el = this._createEl('div', {
                display: 'none', color: '#ffd75e', textShadow: '0 0 0.2em #000'
            });
            this._effectEls[effectLine.code] = el;
            this._els.effects.appendChild(el);
        }
        block.appendChild(this._els.effects);

        const health = this._buildBarRow(appTranslator.get('hud.health'), '#5dd35d');
        this._els.healthFill  = health.fill;
        this._els.healthValue = health.value;
        block.appendChild(health.row);

        const armor = this._buildBarRow(appTranslator.get('hud.armor'), '#5dd35d');
        this._els.armorFill  = armor.fill;
        this._els.armorValue = armor.value;
        block.appendChild(armor.row);

        this._root.appendChild(block);
    }

    _buildBarRow(label, color) {
        const row = this._createEl('div', {
            display: 'flex', alignItems: 'center', gap: '0.5em', marginBottom: '0.25em'
        });

        const labelEl = this._createEl('div', {
            width: '1.6em', fontSize: '0.8em', fontWeight: '700', color: '#ccc'
        });
        labelEl.innerText = label;

        const track = this._createEl('div', {
            width: '8em', height: '0.9em', borderRadius: '0.45em',
            backgroundColor: 'rgba(0, 0, 0, 0.55)', overflow: 'hidden'
        });
        const fill = this._createEl('div', {
            width: '0%', height: '100%', borderRadius: '0.45em', backgroundColor: color
        });
        track.appendChild(fill);

        const value = this._createEl('div', {
            minWidth: '2.2em', fontSize: '1.1em', fontWeight: '700', textAlign: 'right'
        });

        row.appendChild(labelEl);
        row.appendChild(track);
        row.appendChild(value);

        return { row, fill, value };
    }

    _buildAmmo() {
        const block = this._createEl('div', this._cornerStyle({ bottom: '1em', right: '1em' }));
        block.style.textAlign = 'right';

        const label = this._createEl('div', { fontSize: '0.7em', fontWeight: '700', color: '#ccc', letterSpacing: '0.15em' });
        label.innerText = appTranslator.get('hud.ammo');

        this._els.ammoValue = this._createEl('div', { fontSize: '1.6em', fontWeight: '800', lineHeight: '1' });
        this._els.ammoValue.innerText = '—';

        block.appendChild(label);
        block.appendChild(this._els.ammoValue);
        this._root.appendChild(block);
    }

    _buildKeys() {
        const block = this._createEl('div', this._cornerStyle({ top: '1em', left: '1em' }));

        const keysRow = this._createEl('div', { display: 'flex', gap: '0.4em' });
        for (const key of Object.keys(this._profile.hudKeyColors())) {
            const pip = this._createEl('div', {
                width: '1em', height: '1em', borderRadius: '50%',
                border: '0.12em solid rgba(255, 255, 255, 0.5)', opacity: '0.25'
            });
            this._keyEls[key] = pip;
            keysRow.appendChild(pip);
        }
        this._els.keysRow = keysRow;
        block.appendChild(keysRow);

        const scores = this._createEl('div', {});
        this._els.scores = scores;
        block.appendChild(scores);

        const secrets = this._createEl('div', {
            display: 'flex', alignItems: 'center', gap: '0.35em',
            marginTop: '0.5em', fontSize: '0.9em', fontWeight: '700'
        });
        const icon = this._createEl('div', { color: '#ffd23d', lineHeight: '1' });
        icon.innerText = '★';
        this._els.secretsValue = this._createEl('div', { color: '#eee' });
        this._els.secretsValue.innerText = '0/0';
        secrets.appendChild(icon);
        secrets.appendChild(this._els.secretsValue);
        scores.appendChild(secrets);

        const kills = this._createEl('div', {
            display: 'flex', alignItems: 'center', gap: '0.35em',
            marginTop: '0.35em', fontSize: '0.9em', fontWeight: '700'
        });
        const skull = this._createEl('div', { color: '#e05f5f', lineHeight: '1' });
        skull.innerText = '☠';
        this._els.killsValue = this._createEl('div', { color: '#eee' });
        this._els.killsValue.innerText = '0/0';
        kills.appendChild(skull);
        kills.appendChild(this._els.killsValue);
        scores.appendChild(kills);

        block.appendChild(this._buildFrags());
        this._root.appendChild(block);
    }

    // ST_drawWidgets in deathmatch: the match clock, then the players' rows,
    // built as they come; hidden until the rules score the frags.
    _buildFrags() {
        const frags = this._createEl('div', {display: 'none'});
        this._els.frags = frags;
        this._els.matchClock = this._createEl('div', {textAlign: 'center', fontSize: '1.1em', fontWeight: '700', color: '#eee'});
        frags.appendChild(this._els.matchClock);

        return frags;
    }

    // One line of the frags block, at the size of the health value: the
    // player's colour left, the score right-aligned, wide enough for the block
    // to keep the same margin to the virtual pad's menu button as to the edge.
    _buildFragRow() {
        const row = this._createEl('div', {
            display: 'none', alignItems: 'center', gap: '0.5em', marginTop: '0.25em', fontSize: '1.1em'
        });
        const swatch = this._createEl('div', {width: '0.7em', height: '0.7em', border: '0.1em solid rgba(255, 255, 255, 0.5)'});
        const value  = this._createEl('div', {marginLeft: 'auto', minWidth: '2.4em', textAlign: 'right', color: '#eee'});
        value.innerText = '0';
        row.appendChild(swatch);
        row.appendChild(value);
        this._els.frags.appendChild(row);

        return {row: row, swatch: swatch, value: value};
    }

    _buildArms() {
        const block = this._createEl('div', this._cornerStyle({ top: '1em', right: '1em' }));
        block.style.textAlign = 'right';

        const panel = this._createEl('div', { display: 'flex', gap: '0.3em', justifyContent: 'flex-end' });
        for (let slot = 1; slot <= this._profile.hudWeaponSlots().count; slot++) {
            const el = this._createEl('div', {
                width: '1.3em', height: '1.3em', borderRadius: '0.2em',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.95em', fontWeight: '700', color: '#555',
                border: '0.1em solid rgba(255, 255, 255, 0.25)'
            });
            el.innerText = String(slot);
            this._armsEls[slot] = el;
            panel.appendChild(el);
        }

        this._els.weaponName = this._createEl('div', { fontSize: '0.85em', fontWeight: '700', color: '#eee', marginTop: '0.3em' });
        this._els.weaponName.innerText = '—';

        block.appendChild(panel);
        block.appendChild(this._els.weaponName);
        this._root.appendChild(block);
    }

    // --- Helpers ---

    _cornerStyle(anchors) {
        const style = {
            position: 'absolute',
            fontSize: '3cqh',
            padding: '0.6em 0.8em',
            borderRadius: '0.5em',
            backgroundColor: 'rgba(0, 0, 0, 0.4)'
        };
        return Object.assign(style, anchors);
    }

    _ratioPct(value, max) {
        const ratio = ((max > 0) ? (value / max) : 0);
        return (Math.max(0, Math.min(1, ratio)) * 100) + '%';
    }

    _createEl(tag, style) {
        const el = document.createElement(tag);
        Object.assign(el.style, style);
        return el;
    }
}

// One line per power-up, in display order: the timed effects (countdown), then
// the permanent ones carried as items. berserkFlash and the map items get none.
HudGameBar.EFFECT_LINES = [
    {code: 'invulnerability', labelCode: 'effect.invulnerability', timed: true},
    {code: 'radiation',       labelCode: 'effect.radiationSuit',   timed: true},
    {code: 'light',           labelCode: 'effect.light',           timed: true},
    {code: 'invisibility',    labelCode: 'effect.invisibility',    timed: true},
    {code: 'berserk',         labelCode: 'effect.berserk',         timed: false}
];
