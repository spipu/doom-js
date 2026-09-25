/**
 * Bytes → QR code, as a scalable SVG element (QrModule prepared first).
 */
class QrEncoder {
    /**
     * @param {Uint8Array} bytes
     * @returns {Promise<{svg: SVGSVGElement, modules: int}>} modules = symbol side, quiet zone included
     */
    static async encode(bytes) {
        await QrModule.ready();
        const result = await ZXingWASM.writeBarcode(bytes, {format: 'QRCode', options: 'ecLevel=' + QrEncoder.EC_LEVEL});
        if (result.error) {
            throw new Error('QR code encoding failed: ' + result.error);
        }
        const svg = new DOMParser().parseFromString(result.svg, 'image/svg+xml').documentElement;
        // Zint writes a fixed-size SVG without viewBox, which never scales to its frame.
        svg.setAttribute('viewBox', '0 0 ' + svg.getAttribute('width') + ' ' + svg.getAttribute('height'));
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.setAttribute('shape-rendering', 'crispEdges');
        return {svg, modules: result.symbol.width};
    }
}

// M resists the glare and moiré of a filmed screen better than L, for a barely larger symbol;
// a screen is never damaged, which is all Q and H would add.
QrEncoder.EC_LEVEL = 'M';
