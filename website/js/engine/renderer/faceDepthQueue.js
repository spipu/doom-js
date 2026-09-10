/**
 * Screen triangles of one frame with their depth, for the painter's algorithm
 * of the canvas-2D renderers: the whole scene is queued while the objects are
 * transformed, then drawn in one sorted pass. That is the only way to order the
 * map and the bodies against each other, each object being drawn on its own.
 *
 * The screen coordinates are COPIED in: a billboard object is shared by every
 * instance using that sprite, so its projection is overwritten before the frame
 * ends and a deferred draw could not read it back.
 */
class FaceDepthQueue {
    // Empty until the first push: a GPU renderer inherits this queue and never
    // fills it, and must not pay for its buffers.
    constructor() {
        this._geometry = new Float32Array(0);
        this._styles   = new Uint32Array(0);
        this._order    = new Uint32Array(0);
        this._count    = 0;
    }

    clear() {
        this._count = 0;
        return this;
    }

    getCount() {
        return this._count;
    }

    // Read directly by the draw pass: one triangle at index i occupies STRIDE
    // slots from i * STRIDE.
    getGeometry() {
        return this._geometry;
    }

    getStyles() {
        return this._styles;
    }

    push(x0, y0, x1, y1, x2, y2, depth, styleId) {
        if (this._count === this._styles.length) {
            this._grow();
        }
        const g = this._geometry;
        const o = this._count * FaceDepthQueue.STRIDE;
        g[o]     = x0;
        g[o + 1] = y0;
        g[o + 2] = x1;
        g[o + 3] = y1;
        g[o + 4] = x2;
        g[o + 5] = y2;
        g[o + 6] = depth;
        this._styles[this._count] = styleId;
        this._count++;

        return this;
    }

    // Triangle indices, farthest first. The array is reused from frame to
    // frame, so a steady scene sorts without allocating anything.
    sorted() {
        const order = this._order.subarray(0, this._count);
        for (let i = 0; i < this._count; i++) {
            order[i] = i;
        }
        const g = this._geometry;

        return order.sort((a, b) => (g[b * FaceDepthQueue.STRIDE + 6] - g[a * FaceDepthQueue.STRIDE + 6]));
    }

    // Capacity doubles and never shrinks: a level settles on its own peak
    // within a few frames, then allocates no more.
    _grow() {
        const capacity = Math.max(FaceDepthQueue.INITIAL_CAPACITY, this._styles.length * 2);
        const geometry = new Float32Array(capacity * FaceDepthQueue.STRIDE);
        geometry.set(this._geometry);
        const styles = new Uint32Array(capacity);
        styles.set(this._styles);
        this._geometry = geometry;
        this._styles   = styles;
        this._order    = new Uint32Array(capacity);
    }
}

// One triangle = [x0, y0, x1, y1, x2, y2, depth].
FaceDepthQueue.STRIDE = 7;

// Triangles the buffers jump to on the first push, before doubling.
FaceDepthQueue.INITIAL_CAPACITY = 4096;
