/**
 * Little-endian binary reader, the mirror of NetByteWriter. A read past the end throws
 * (DataView RangeError), which is what fail-fast decoding relies on.
 */
class NetByteReader {
    /** @type {DataView} */ _view;
    /** @type {int}      */ _offset;

    /**
     * @param {Uint8Array|ArrayBuffer} source
     */
    constructor(source) {
        const bytes  = ((source instanceof Uint8Array) ? source : new Uint8Array(source));
        this._view   = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        this._offset = 0;
    }

    u8() {
        return this._view.getUint8(this._advance(1));
    }

    u16() {
        return this._view.getUint16(this._advance(2), true);
    }

    u32() {
        return this._view.getUint32(this._advance(4), true);
    }

    f32() {
        return this._view.getFloat32(this._advance(4), true);
    }

    /**
     * @returns {Uint8Array} a copy
     */
    bytes(count) {
        if ((this._offset + count) > this._view.byteLength) {
            throw new RangeError('Read past the end of the message');
        }
        const start = this._view.byteOffset + this._advance(count);
        return new Uint8Array(this._view.buffer.slice(start, start + count));
    }

    ascii() {
        return String.fromCharCode(...this.bytes(this.u8()));
    }

    /**
     * @returns {Uint8Array} every byte left
     */
    rest() {
        return this.bytes(this.remaining());
    }

    remaining() {
        return this._view.byteLength - this._offset;
    }

    isAtEnd() {
        return (this._offset === this._view.byteLength);
    }

    _advance(count) {
        const offset = this._offset;
        this._offset += count;
        return offset;
    }
}
