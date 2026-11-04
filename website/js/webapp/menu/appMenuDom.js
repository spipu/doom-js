/**
 * Shared DOM building helpers of the menus, used by the screens and the modals
 * — one single way to create an element, a text block or a button.
 */
class AppMenuDom {
    // Press feedback: a pressed control brightens for this long, then its
    // action fires — the press stays visible on mouse, keyboard, gamepad and
    // touch alike.
    static PRESS_FEEDBACK_MS = 250;
    static HTML_TAG_PATTERN  = /<(\/?)(b|i|u)>/gi;
    static _pressing         = false;

    static isPressing() {
        return AppMenuDom._pressing;
    }

    // One press in flight at a time, across every button and list entry: a
    // second activation during the feedback beat is dropped, never queued. A
    // control removed meanwhile (its screen re-rendered) drops its action.
    static press(el, pressedClass, action, feedbackMs = AppMenuDom.PRESS_FEEDBACK_MS) {
        if (AppMenuDom._pressing === true) {
            return;
        }
        AppMenuDom._pressing = true;
        AppMenuSound.play(AppMenuSound.CHOOSE);
        el.classList.add(pressedClass);
        setTimeout(() => {
            AppMenuDom._pressing = false;
            el.classList.remove(pressedClass);
            if (!el.isConnected) {
                return;
            }
            action();
        }, feedbackMs);
    }

    static addElement(parent, tagName, className) {
        const element = document.createElement(tagName);
        element.className = className;
        parent.appendChild(element);

        return element;
    }

    // A colour mark (a player's slot colour), right before the label of a list entry, else first in its parent.
    static addColorSwatch(parent, color) {
        const swatch = AppMenuDom.addElement(parent, 'span', 'app-menu-color-swatch');
        swatch.style.background = color;
        parent.insertBefore(swatch, (parent.querySelector(':scope > .app-menu-item-label') ?? parent.firstChild));

        return swatch;
    }

    static addText(parent, className, text) {
        const element = AppMenuDom.addElement(parent, 'div', className);
        element.textContent = text;

        return element;
    }

    static addHtmlText(parent, className, html) {
        const element = AppMenuDom.addElement(parent, 'div', className);
        AppMenuDom.setHtmlContent(element, html);

        return element;
    }

    // A text with the formatting tags of HTML_TAG_PATTERN only (bold, italic, underline), without attribute.
    // Never parsed as HTML: the tags are built by createElement, anything else (another tag, an attribute, a
    // closing tag without its opening one) stays plain text; an opening tag never closed runs to the end.
    static setHtmlContent(element, html) {
        element.textContent = '';
        const stack = [element];
        let last    = 0;
        for (const match of html.matchAll(AppMenuDom.HTML_TAG_PATTERN)) {
            const current = stack[stack.length - 1];
            current.appendChild(document.createTextNode(html.slice(last, match.index)));
            last = match.index + match[0].length;

            const tagName = match[2].toLowerCase();
            if (match[1] === '') {
                stack.push(current.appendChild(document.createElement(tagName)));
                continue;
            }
            if ((stack.length > 1) && (current.tagName.toLowerCase() === tagName)) {
                stack.pop();
                continue;
            }
            current.appendChild(document.createTextNode(match[0]));
        }
        stack[stack.length - 1].appendChild(document.createTextNode(html.slice(last)));
    }

    // Opens in a new tab: the app is a PWA, so following a link in place would
    // leave the app shell with no way back.
    static addLink(parent, className, text, href) {
        const element = AppMenuDom.addElement(parent, 'a', className);
        element.textContent = text;
        element.href        = href;
        element.target      = '_blank';
        element.rel         = 'noopener noreferrer';

        return element;
    }

    // Selectable list entry shell (selection arrows around the label) — the caller registers it on its
    // AppMenuListNavigation and may append extra children (infos, value, buttons).
    static addListItem(listEl, labelText) {
        const item = AppMenuDom.addElement(listEl, 'div', 'app-menu-item');
        AppMenuDom.addElement(item, 'span', 'app-menu-item-arrow');
        AppMenuDom.addText(item, 'app-menu-item-label', labelText);
        AppMenuDom.addElement(item, 'span', 'app-menu-item-arrow app-menu-item-arrow-end');

        return item;
    }

    /**
     * Value of a list entry, on its right; a value cycled by Left / Right shows its two chevrons when selected.
     *
     * @returns {HTMLElement} the element holding the text
     */
    static addValue(item, text, cycles = false) {
        const box = AppMenuDom.addElement(item, 'span', 'app-menu-item-value' + ((cycles) ? ' app-menu-item-value-cycle' : ''));
        AppMenuDom.addElement(box, 'span', 'app-menu-item-chevron');
        const valueEl = AppMenuDom.addText(box, 'app-menu-item-value-text', text);
        AppMenuDom.addElement(box, 'span', 'app-menu-item-chevron app-menu-item-chevron-end');

        return valueEl;
    }

    /**
     * Label / value table of a detail panel.
     *
     * @param {HTMLElement}                       parent
     * @param {{label: string, value: string}[]} facts
     */
    static addFacts(parent, facts) {
        const table = AppMenuDom.addElement(parent, 'div', 'app-menu-facts');
        for (const fact of facts) {
            AppMenuDom.addText(table, 'app-menu-fact-label', fact.label);
            AppMenuDom.addText(table, 'app-menu-fact-value', fact.value);
        }

        return table;
    }

    // Delete cross of a list row (press feedback included, row not selected).
    static addDeleteButton(item, titleText, onDelete) {
        const button = AppMenuDom.addIconButton(item, 'app-menu-button app-menu-item-delete', 'close', '', onDelete);
        button.title = titleText;

        return button;
    }

    // Overlay stacking rule: only the top-most overlay of a display reacts to
    // inputs (a nested modal suspends everything beneath it).
    static isTopOverlay(container, overlay) {
        const overlays = container.querySelectorAll('.app-menu-overlay');

        return (overlays[overlays.length - 1] === overlay);
    }

    static hasOverlay(container) {
        return (container.querySelector('.app-menu-overlay') !== null);
    }

    static formatMegabytes(bytes) {
        return new Intl.NumberFormat(appTranslator.getLocale(), {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(bytes / 1048576)
            + ' ' + appTranslator.get('unit.megabyte');
    }

    static formatSize(bytes) {
        const oneDecimal = (value) => new Intl.NumberFormat(appTranslator.getLocale(), {minimumFractionDigits: 1, maximumFractionDigits: 1}).format(value);
        if (bytes >= 1048576) {
            return oneDecimal(bytes / 1048576) + ' ' + appTranslator.get('unit.megabyte');
        }
        if (bytes >= 1024) {
            return oneDecimal(bytes / 1024) + ' ' + appTranslator.get('unit.kilobyte');
        }

        return bytes + ' ' + appTranslator.get('unit.byte');
    }

    /**
     * @param {int} totalSeconds
     * @param {int} minuteDigits - minutes padded to this many digits
     * @returns {string} M:SS or MM:SS
     */
    static formatClock(totalSeconds, minuteDigits) {
        return String(Math.trunc(totalSeconds / 60)).padStart(minuteDigits, '0') + ':' + String(totalSeconds % 60).padStart(2, '0');
    }

    static formatDay(timestamp) {
        return new Date(timestamp).toLocaleDateString(appTranslator.getLocale());
    }

    // "19 July 2026", the month spelled out: a detail panel has the room for it.
    static formatLongDay(timestamp) {
        return new Date(timestamp).toLocaleDateString(appTranslator.getLocale(), {day: 'numeric', month: 'long', year: 'numeric'});
    }

    // Seconds are for the save slots: two saves may land in the same minute.
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

    // A button led by an icon of appMenu.css (its class app-menu-icon-<name>).
    static addIconButton(parent, className, icon, label, onClick, feedbackMs = AppMenuDom.PRESS_FEEDBACK_MS) {
        return AppMenuDom.addButton(parent, className + ' app-menu-icon app-menu-icon-' + icon, label, onClick, feedbackMs);
    }

    // A button showing its icon only: its name goes to the tooltip and to screen readers.
    static addIconOnlyButton(parent, className, icon, name, onClick, feedbackMs = AppMenuDom.PRESS_FEEDBACK_MS) {
        const button = AppMenuDom.addIconButton(parent, className + ' app-menu-icon-only', icon, '', onClick, feedbackMs);
        button.title = name;
        button.setAttribute('aria-label', name);

        return button;
    }

    // The blur avoids a focused button: a focused one would swallow the next
    // Enter as a native re-click (e.g. reopening a freshly closed modal).
    // Propagation stops right away — a delete cross must not select its row.
    static addButton(parent, className, label, onClick, feedbackMs = AppMenuDom.PRESS_FEEDBACK_MS) {
        const button = AppMenuDom.addElement(parent, 'button', className);
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            event.currentTarget.blur();
            AppMenuDom.press(button, 'app-menu-button-pressed', () => {
                onClick(event);
            }, feedbackMs);
        });

        return button;
    }
}
