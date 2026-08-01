/**
 * Shared DOM building helpers of the doom menu, used by the screens, the
 * modals and the fallback screen — one single way to create an element, a
 * text block or a button.
 */
class MenuDom {
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
    static addButton(parent, className, label, onClick) {
        const button = MenuDom.addElement(parent, 'button', className);
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', (event) => {
            event.currentTarget.blur();
            onClick(event);
        });

        return button;
    }
}
