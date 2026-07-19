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
