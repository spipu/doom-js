/**
 * Graphical game HUD, a DOM/CSS overlay of our own (no WAD lumps) laid out in
 * the screen corners over the letterboxed display:
 *   - bottom-left : running power-ups, health and armor bars
 *   - bottom-right: ammo of the active weapon ('—' if none)
 *   - top-left    : key pips (lit when owned), secret and kill counts
 *   - top-right   : weapon slots + active weapon name
 *   - bottom-centre: optional fps readout
 *
 * Sizes are in cqh on a size container, so the whole bar follows the letterbox
 * height.
 */
class HudGameBar extends AbstractHud {
    constructor(engine) {
        super(engine);
        this._game      = null;
        this._root      = null;
        this._els       = {};
        this._keyEls    = {};
        this._armsEls   = {};
        this._effectEls = {};
    }

    // Weapon slots and key set come from the game profile; empty layout when
    // no game is bound.
    _slotConfig() {
        if (this._game === null) {
            return {count: 0, byWeapon: {}, alwaysOwnedSlot: 0, upgradeWeapon: null};
        }
        return this._game.getGameProfile().hudWeaponSlots();
    }

    _keyColors() {
        return ((this._game !== null) ? this._game.getGameProfile().hudKeyColors() : {});
    }

    bindGame(game) {
        this._game = game;
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

        if (this._game !== null) {
            this._els.secretsValue.innerText = this._game.getSecretsFound() + '/' + this._game.getSecretsTotal();
            this._els.killsValue.innerText   = this._game.getKillsCount() + '/' + this._game.getKillsTotal();
        }

        this._updateFps();
    }

    // Read every frame, like the crosshair: a toggle from the options, which the
    // pause menu reaches mid-level, applies without reloading.
    _updateFps() {
        const visible = doomSettings.getDisplayShowFps();
        this._els.fpsBlock.style.display = ((visible) ? 'block' : 'none');
        if (visible) {
            this._els.fpsValue.innerText = appTranslator.get('hud.fps', {value: this._engine.getFps()});
        }
    }

    _updateAmmo(user) {
        const code   = user.getActiveWeapon();
        const weapon = ((this._game !== null) ? this._game.getWeapon(code) : null);
        const type   = ((weapon !== null) ? weapon.getAmmoType() : null);
        this._els.ammoValue.innerText = ((type === null) ? '—' : user.getAmmo(type) + '/' + user.getAmmoMax(type));
    }

    _updateArms(user) {
        const slots        = this._slotConfig();
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

        const weapon = ((this._game !== null) ? this._game.getWeapon(code) : null);
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
                const seconds = Math.ceil(remainingMs / 1000);
                el.innerText = appTranslator.get(effectLine.labelCode) + ' '
                    + Math.trunc(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
                el.style.visibility = ((user.isEffectVisible(effectLine.code)) ? 'visible' : 'hidden');
            } else {
                el.innerText = appTranslator.get(effectLine.labelCode);
            }
        }
    }

    _updateKeys(user) {
        const keyColors = this._keyColors();
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
        for (const key of Object.keys(this._keyColors())) {
            const pip = this._createEl('div', {
                width: '1em', height: '1em', borderRadius: '50%',
                border: '0.12em solid rgba(255, 255, 255, 0.5)', opacity: '0.25'
            });
            this._keyEls[key] = pip;
            keysRow.appendChild(pip);
        }
        block.appendChild(keysRow);

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
        block.appendChild(secrets);

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
        block.appendChild(kills);

        this._root.appendChild(block);
    }

    _buildArms() {
        const block = this._createEl('div', this._cornerStyle({ top: '1em', right: '1em' }));
        block.style.textAlign = 'right';

        const panel = this._createEl('div', { display: 'flex', gap: '0.3em', justifyContent: 'flex-end' });
        for (let slot = 1; slot <= this._slotConfig().count; slot++) {
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
