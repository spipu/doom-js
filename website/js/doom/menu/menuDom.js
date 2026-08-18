/**
 * Shared DOM building helpers of the doom menu, used by the screens, the
 * modals and the fallback screen — one single way to create an element, a
 * text block or a button.
 */
class MenuDom {
    // Press feedback: a pressed control brightens for this long, then its
    // action fires — the press stays visible on mouse, keyboard, gamepad and
    // touch alike.
    static PRESS_FEEDBACK_MS = 250;
    static _pressing         = false;

    static isPressing() {
        return MenuDom._pressing;
    }

    // One press in flight at a time, across every button and list entry: a
    // second activation during the feedback beat is dropped, never queued. A
    // control removed meanwhile (its screen re-rendered) drops its action.
    static press(el, pressedClass, action) {
        if (MenuDom._pressing === true) {
            return;
        }
        MenuDom._pressing = true;
        el.classList.add(pressedClass);
        setTimeout(() => {
            MenuDom._pressing = false;
            el.classList.remove(pressedClass);
            if (!el.isConnected) {
                return;
            }
            action();
        }, MenuDom.PRESS_FEEDBACK_MS);
    }

    static addElement(parent, tagName, className) {
        const element = document.createElement(tagName);
        element.className = className;
        parent.appendChild(element);

        return element;
    }

    static addText(parent, className, text) {
        const element = MenuDom.addElement(parent, 'div', className);
        element.textContent = text;

        return element;
    }

    // Selectable list entry shell (item + label) — the caller registers it on
    // its MenuListNavigation and may append extra children (infos, buttons).
    static addListItem(listEl, labelText) {
        const item = MenuDom.addElement(listEl, 'div', 'doom-menu-item');
        MenuDom.addText(item, 'doom-menu-item-label', labelText);

        return item;
    }

    // Delete cross of a list row (press feedback included, row not selected).
    static addDeleteButton(item, titleText, onDelete) {
        const button = MenuDom.addButton(item, 'doom-menu-button doom-menu-item-delete', '\u2715', onDelete);
        button.title = titleText;

        return button;
    }

    // Overlay stacking rule: only the top-most overlay of a display reacts to
    // inputs (a nested modal suspends everything beneath it).
    static isTopOverlay(container, overlay) {
        const overlays = container.querySelectorAll('.doom-menu-overlay');

        return (overlays[overlays.length - 1] === overlay);
    }

    static hasOverlay(container) {
        return (container.querySelector('.doom-menu-overlay') !== null);
    }

    // Locale-formatted size in the current locale's digits and the translated
    // unit (WAD list entries).
    static formatSize(bytes) {
        const decimal = (value) => new Intl.NumberFormat(appTranslator.getLocale(), {minimumFractionDigits: 1, maximumFractionDigits: 1}).format(value);
        if (bytes >= 1048576) {
            return decimal(bytes / 1048576) + ' ' + appTranslator.get('unit.megabyte');
        }
        if (bytes >= 1024) {
            return decimal(bytes / 1024) + ' ' + appTranslator.get('unit.kilobyte');
        }

        return bytes + ' ' + appTranslator.get('unit.byte');
    }

    // Locale-formatted "date hour:minute[:second]" of a timestamp (WAD list
    // entries, save slots — the latter with seconds: two saves may land in the
    // same minute) — the words come from the translator, the format from Intl.
    static formatDate(timestamp, withSeconds = false) {
        const date        = new Date(timestamp);
        const locale      = appTranslator.getLocale();
        const timeOptions = {hour: '2-digit', minute: '2-digit'};
        if (withSeconds) {
            timeOptions.second = '2-digit';
        }

        return date.toLocaleDateString(locale)
            + ' ' + date.toLocaleTimeString(locale, timeOptions);
    }

    // The blur avoids a focused button: a focused one would swallow the next
    // Enter as a native re-click (e.g. reopening a freshly closed modal).
    // Propagation stops right away — a delete cross must not select its row.
    static addButton(parent, className, label, onClick) {
        const button = MenuDom.addElement(parent, 'button', className);
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            event.currentTarget.blur();
            MenuDom.press(button, 'doom-menu-button-pressed', () => {
                onClick(event);
            });
        });

        return button;
    }
}
