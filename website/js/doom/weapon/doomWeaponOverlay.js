/**
 * Turns a weapon view into the screen sprites the engine's overlay pass draws,
 * the same on every device. Placement follows Doom's R_DrawPSprite in a
 * 320x200 base (left = sx - leftOffset, top = sy - topOffset), normalised to
 * 0..1 screen space.
 */
class DoomWeaponOverlay {
    /**
     * @param {DoomWeaponSpriteBank} spriteBank
     * @param {DoomItemCatalog}      itemCatalog - the per-weapon vertical offset
     */
    constructor(spriteBank, itemCatalog) {
        this._sprites     = spriteBank;
        this._itemCatalog = itemCatalog;
    }

    /**
     * @param {DoomWeaponView} view
     * @param {number}         light - sector light factor of the non-bright frames
     * @returns {Array<{texId, x, y, w, h, light}>} weapon first, then its flash
     */
    sprites(view, light) {
        if ((view.getWeapon() === null) || view.isLowered()) {
            return [];
        }
        // gzdoom Weapon.YAdjust, 320x200 pixels, positive = down: Heretic draws its weapons lower.
        const yAdjust = this._itemCatalog.getWeapon(view.getWeapon()).getYAdjust();
        const out     = [];
        const weapon  = this._sprite(view.getWeaponLump(), view, yAdjust, ((view.isWeaponBright()) ? 1 : light));
        if (weapon !== null) {
            out.push(weapon);
        }
        const flash = this._sprite(view.getFlashLump(), view, yAdjust, 1);
        if (flash !== null) {
            out.push(flash);
        }

        return out;
    }

    _sprite(lump, view, yAdjust, light) {
        if (lump === null) {
            return null;
        }
        const spr = this._sprites.get(lump);
        if (spr === null) {
            return null;
        }
        const left = view.getOffsetX() - spr.leftOffset;
        const top  = (view.getOffsetY() + yAdjust) - spr.topOffset;

        return {
            texId: spr.texId,
            x:     left / DoomWeaponOverlay.BASE_W,
            y:     top / DoomWeaponOverlay.BASE_H,
            w:     spr.width / DoomWeaponOverlay.BASE_W,
            h:     spr.height / DoomWeaponOverlay.BASE_H,
            light: light,
        };
    }
}

// psprite reference screen (Doom SCREENWIDTH / height).
DoomWeaponOverlay.BASE_W = 320;
DoomWeaponOverlay.BASE_H = 200;
