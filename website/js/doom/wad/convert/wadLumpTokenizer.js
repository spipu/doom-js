/**
 * Lexer of the WAD text lumps (UMAPINFO, TERRAIN): quoted strings, one-char
 * symbols and bare words, with C-style comments treated as whitespace.
 *
 * None of these lumps is specified with a formal grammar; what they share is
 * this lexical level, so every reader tokenizes here and only the grammar
 * above it differs.
 */
class WadLumpTokenizer {
    /**
     * @param {string} text    the lump's content
     * @param {string} symbols the characters standing alone as their own token
     * @returns {object[]} {type: 'word'|'string', value} or {type: the symbol}
     */
    static tokenize(text, symbols) {
        const tokens = [];
        let i = 0;
        while (i < text.length) {
            const c = text[i];
            if ((c === '/') && (text[i + 1] === '/')) {
                while ((i < text.length) && (text[i] !== '\n')) {
                    i++;
                }
                continue;
            }
            if ((c === '/') && (text[i + 1] === '*')) {
                const end = text.indexOf('*/', i + 2);
                i = ((end === -1) ? text.length : end + 2);
                continue;
            }
            if (text.charCodeAt(i) <= 32) {
                i++;
                continue;
            }
            if (c === '"') {
                const end = text.indexOf('"', i + 1);
                if (end === -1) {
                    throw new Error('unterminated string');
                }
                tokens.push({type: 'string', value: text.slice(i + 1, end)});
                i = end + 1;
                continue;
            }
            if (symbols.indexOf(c) !== -1) {
                tokens.push({type: c});
                i++;
                continue;
            }
            let j = i;
            while (j < text.length) {
                const cj = text[j];
                if ((text.charCodeAt(j) <= 32) || (symbols.indexOf(cj) !== -1) || (cj === '"')) {
                    break;
                }
                if ((cj === '/') && ((text[j + 1] === '/') || (text[j + 1] === '*'))) {
                    break;
                }
                j++;
            }
            tokens.push({type: 'word', value: text.slice(i, j)});
            i = j;
        }

        return tokens;
    }
}
