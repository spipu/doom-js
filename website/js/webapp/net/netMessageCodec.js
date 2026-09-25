/**
 * Typed messages over a NetLink. Control messages are JSON objects with a `type` field,
 * sent as strings; stream messages are ArrayBuffers whose first byte is their type, passed
 * through untouched. A binary message larger than the chunk size travels as `chunk`
 * messages and is rebuilt before delivery — the type of what arrives tells both families apart.
 */
class NetMessageCodec {
    /** @type {NetLink}       */ _link;
    /** @type {function|null} */ _onControl;
    /** @type {function|null} */ _onBinary;
    /** @type {function|null} */ _onInvalid;
    /** @type {Map}           */ _partials;
    /** @type {int}           */ _nextChunkedId;

    /**
     * @param {NetLink} link
     */
    constructor(link) {
        this._link          = link;
        this._onControl     = null;
        this._onBinary      = null;
        this._onInvalid     = null;
        this._partials      = new Map();
        this._nextChunkedId = 0;
        link.setOnMessage((message) => this._receive(message));
    }

    getLink() {
        return this._link;
    }

    /**
     * @param {{type: string}} message
     */
    sendControl(message) {
        this._link.send(JSON.stringify(message));
    }

    /**
     * @param {ArrayBuffer} buffer - its first byte is its type, never NetMessageCodec.CHUNK_TYPE
     */
    sendBinary(buffer) {
        if (!(buffer instanceof ArrayBuffer)) {
            throw new TypeError('A binary message is an ArrayBuffer');
        }
        if (buffer.byteLength <= NetConfig.CHUNK_SIZE) {
            this._link.send(buffer);
            return;
        }
        const id    = this._nextChunkedId;
        const count = Math.ceil(buffer.byteLength / NetConfig.CHUNK_SIZE);
        this._nextChunkedId = (this._nextChunkedId + 1) >>> 0;
        for (let index = 0; index < count; index++) {
            const offset = index * NetConfig.CHUNK_SIZE;
            const part   = new Uint8Array(buffer, offset, Math.min(NetConfig.CHUNK_SIZE, buffer.byteLength - offset));
            const writer = new NetByteWriter(NetMessageCodec.CHUNK_HEADER_BYTES + part.length)
                .u8(NetMessageCodec.CHUNK_TYPE)
                .u32(id)
                .u16(index)
                .u16(count)
                .bytes(part);
            this._link.send(writer.toBytes().buffer);
        }
    }

    /**
     * @param {function({type: string})} callback
     */
    setOnControl(callback) {
        this._onControl = callback;
        return this;
    }

    /**
     * @param {function(ArrayBuffer)} callback
     */
    setOnBinary(callback) {
        this._onBinary = callback;
        return this;
    }

    /**
     * @param {function(NetError)} callback - a message that is neither valid JSON nor a valid chunk
     */
    setOnInvalid(callback) {
        this._onInvalid = callback;
        return this;
    }

    _receive(message) {
        try {
            if (typeof message === 'string') {
                this._receiveControl(message);
                return;
            }
            this._receiveBinary(message);
        } catch (error) {
            this._reportInvalid(error);
        }
    }

    _receiveControl(text) {
        const message = JSON.parse(text);
        if ((message === null) || (typeof message.type !== 'string')) {
            throw new NetError(NetError.INVALID_MESSAGE, 'Control message without type');
        }
        this._onControl?.(message);
    }

    _receiveBinary(buffer) {
        if (buffer.byteLength === 0) {
            throw new NetError(NetError.INVALID_MESSAGE, 'Empty binary message');
        }
        if (new Uint8Array(buffer, 0, 1)[0] !== NetMessageCodec.CHUNK_TYPE) {
            this._deliverBinary(buffer);
            return;
        }
        this._receiveChunk(buffer);
    }

    _receiveChunk(buffer) {
        const reader = new NetByteReader(buffer);
        reader.u8();
        const id      = reader.u32();
        const index   = reader.u16();
        const count   = reader.u16();
        const partial = this._partials.get(id) ?? {count, parts: new Array(count), received: 0, size: 0};
        if ((count !== partial.count) || (index >= count) || (partial.parts[index] !== undefined)) {
            throw new NetError(NetError.INVALID_MESSAGE, 'Inconsistent chunk ' + index + '/' + count + ' of message ' + id);
        }
        partial.parts[index] = reader.rest();
        partial.received    += 1;
        partial.size        += partial.parts[index].length;
        this._partials.set(id, partial);
        if (partial.received < partial.count) {
            return;
        }
        this._partials.delete(id);
        const whole = new Uint8Array(partial.size);
        let offset  = 0;
        for (const part of partial.parts) {
            whole.set(part, offset);
            offset += part.length;
        }
        this._deliverBinary(whole.buffer);
    }

    _deliverBinary(buffer) {
        this._onBinary?.(buffer);
    }

    _reportInvalid(error) {
        this._onInvalid?.((error instanceof NetError) ? error : new NetError(NetError.INVALID_MESSAGE, error.message));
    }
}

NetMessageCodec.CHUNK_TYPE         = 0xFF;
NetMessageCodec.CHUNK_HEADER_BYTES = 9;
