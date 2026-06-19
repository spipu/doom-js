/**
 * Doom HUD. For now a debug overlay only: it extends HudDebug (fps / position /
 * inputs / energy) and appends the player's Doom equipment — armor, weapons,
 * ammo, items, timed effects. It reads the bound DoomUser directly (no need for
 * the definitions catalog). This will be replaced by the graphical Doom status
 * bar later; the text rendered here is throwaway.
 */
class HudDoom extends HudDebug {
    // The WAD id and level code are not player state — they belong to the
    // running level (DoomGame owns them) and are pushed in here only for display.
    // The [LEVEL] line is rendered in the exact form expected by
    // MenuNavigator.start(wadName, levelCode, ...) so a spawn can be reproduced
    // straight from a screenshot.
    setLevelInfo(wadId, levelCode, skill) {
        this._wadId     = wadId;
        this._levelCode = levelCode;
        this._skill     = skill;
        return this;
    }

    update() {
        super.update();
        if (this._user) {
            this._el.innerText = this._buildEquipment() + '\n' + this._el.innerText;
        }
    }

    _buildEquipment() {
        const u = this._user;
        const lines = [];

        lines.push('[LEVEL] ' + (this._wadId ?? '?') + ' / ' + (this._levelCode ?? '?')
            + ' / ' + (this._skill ?? '?'));

        lines.push('[ARMOR] ' + Math.ceil(u.getArmor()) + '/' + u.getMaxArmor()
            + ' (' + Math.round(u.getArmorAbsorb() * 100) + '%)');

        const owned = Object.keys(u._weapons).filter(code => u.hasWeapon(code));
        lines.push('[WEAPON] active=' + u.getActiveWeapon()
            + ' | owned: ' + ((owned.length > 0) ? owned.join(' ') : '-'));

        const ammo = ['bullets', 'shells', 'rockets', 'cells']
            .map(type => type + ':' + u.getAmmo(type) + '/' + u.getAmmoMax(type));
        lines.push('[AMMO] ' + ammo.join(' '));

        const items = Array.from(u._items);
        const effects = Object.keys(u._effects)
            .map(code => code + '(' + Math.ceil(u._effects[code] / 1000) + 's)');
        lines.push('[ITEMS] ' + ((items.length > 0) ? items.join(' ') : '-')
            + ' | fx: ' + ((effects.length > 0) ? effects.join(' ') : '-'));

        return lines.join('\n');
    }
}
