/**
 * Growable little-endian binary writer: every multi-byte field goes through DataView
 * with littleEndian = true, never through a TypedArray view of the buffer.
 */
class NetByteWriter {
    /** @type {ArrayBuffer} */ _buffer;
    /** @type {DataView}    */ _view;
    /** @type {int}         */ _length;

    constructor(capacity = NetByteWriter.INITIAL_CAPACITY) {
        this._buffer = new ArrayBuffer(capacity);
        this._view   = new DataView(this._buffer);
        this._length = 0;
    }

    u8(value) {
        this._reserve(1).setUint8(this._advance(1), value);
        return this;
    }

    u16(value) {
        this._reserve(2).setUint16(this._advance(2), value, true);
        return this;
    }

    u32(value) {
        this._reserve(4).setUint32(this._advance(4), value, true);
        return this;
    }

    f32(value) {
        this._reserve(4).setFloat32(this._advance(4), value, true);
        return this;
    }

    /**
     * @param {Uint8Array|number[]} source
     */
    bytes(source) {
        this._reserve(source.length);
        new Uint8Array(this._buffer, this._length, source.length).set(source);
        this._advance(source.length);
        return this;
    }

    /**
     * ASCII string prefixed by its u8 length.
     */
    ascii(text) {
        if (text.length > NetByteWriter.MAX_ASCII_LENGTH) {
            throw new RangeError('ASCII field longer than ' + NetByteWriter.MAX_ASCII_LENGTH);
        }
        this.u8(text.length);
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            if (code > NetByteWriter.MAX_ASCII_CODE) {
                throw new RangeError('Non-ASCII character in an ASCII field');
            }
            this.u8(code);
        }
        return this;
    }

    getLength() {
        return this._length;
    }

    /**
     * @returns {Uint8Array} a copy of the written bytes
     */
    toBytes() {
        return new Uint8Array(this._buffer.slice(0, this._length));
    }

    _reserve(count) {
        if ((this._length + count) <= this._buffer.byteLength) {
            return this._view;
        }
        const grown = new ArrayBuffer(Math.max(this._buffer.byteLength * 2, this._length + count));
        new Uint8Array(grown).set(new Uint8Array(this._buffer, 0, this._length));
        this._buffer = grown;
        this._view   = new DataView(grown);
        return this._view;
    }

    _advance(count) {
        const offset = this._length;
        this._length += count;
        return offset;
    }
}

NetByteWriter.INITIAL_CAPACITY = 256;
NetByteWriter.MAX_ASCII_LENGTH = 255;
NetByteWriter.MAX_ASCII_CODE   = 0x7F;
