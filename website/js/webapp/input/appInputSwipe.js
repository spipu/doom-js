/**
 * Swipe gestures on a touch screen: left, right, up, down, recognised while the finger slides, as soon as it has
 * travelled a fraction of the element's height, without waiting for it to lift.
 *
 * One long slide in one direction is one gesture; the same finger makes a new gesture only when it changes direction
 * (axis or sign), counted from the point where the previous one was recognised. Each finger is followed on its own.
 * The listeners are passive and never call preventDefault (a virtual pad on top keeps its own); attach() sets
 * touch-action: none on the element so the browser does not scroll or zoom under the gestures, detach() gives the
 * previous value back. The gestures wait in a short queue, read by poll().
 */
class AppInputSwipe {
    /**
     * @param {HTMLElement} element - the area whose touches are read
     */
    constructor(element) {
        this._element     = element;
        this._threshold   = AppInputSwipe.DEFAULT_THRESHOLD;
        this._fingers     = new Map();   // touch identifier -> {x, y, last}
        this._queue       = [];
        this._touchAction = null;
        this._attached    = false;
        this._onStart     = (event) => this._start(event);
        this._onMove      = (event) => this._move(event);
        this._onEnd       = (event) => this._end(event);
        this._onResize    = () => this._fingers.clear();
    }

    /**
     * @param {number} fraction - travel that makes a gesture, as a fraction of the element's height
     * @returns {AppInputSwipe}
     */
    setThreshold(fraction) {
        this._threshold = fraction;

        return this;
    }

    attach() {
        if (this._attached) {
            return this;
        }
        this._attached    = true;
        this._touchAction = this._element.style.touchAction;
        this._element.style.touchAction = 'none';
        this._element.addEventListener('touchstart', this._onStart, {passive: true});
        this._element.addEventListener('touchmove', this._onMove, {passive: true});
        this._element.addEventListener('touchend', this._onEnd, {passive: true});
        this._element.addEventListener('touchcancel', this._onEnd, {passive: true});
        window.addEventListener('resize', this._onResize);

        return this;
    }

    detach() {
        if (!this._attached) {
            return this;
        }
        this._attached = false;
        this._element.style.touchAction = this._touchAction;
        this._element.removeEventListener('touchstart', this._onStart);
        this._element.removeEventListener('touchmove', this._onMove);
        this._element.removeEventListener('touchend', this._onEnd);
        this._element.removeEventListener('touchcancel', this._onEnd);
        window.removeEventListener('resize', this._onResize);
        this.clear();

        return this;
    }

    /**
     * @returns {string|null} the oldest waiting gesture (AppInputSwipe.LEFT, RIGHT, UP, DOWN), or null
     */
    poll() {
        return ((this._queue.length > 0) ? this._queue.shift() : null);
    }

    // Waiting gestures dropped (a menu opened, the game paused); the fingers on the screen are kept.
    clear() {
        this._queue.length = 0;

        return this;
    }

    _start(event) {
        for (const touch of event.changedTouches) {
            this._fingers.set(touch.identifier, {x: touch.clientX, y: touch.clientY, last: null});
        }
    }

    _move(event) {
        const travel = (this._threshold * this._element.getBoundingClientRect().height);
        for (const touch of event.changedTouches) {
            const finger = this._fingers.get(touch.identifier);
            if (finger === undefined) {
                continue;
            }
            const dx = (touch.clientX - finger.x);
            const dy = (touch.clientY - finger.y);
            if (Math.max(Math.abs(dx), Math.abs(dy)) < travel) {
                continue;
            }
            const direction = ((Math.abs(dx) >= Math.abs(dy)) ? ((dx < 0) ? AppInputSwipe.LEFT : AppInputSwipe.RIGHT) : ((dy < 0) ? AppInputSwipe.UP : AppInputSwipe.DOWN));
            finger.x = touch.clientX;
            finger.y = touch.clientY;
            if (direction === finger.last) {
                continue;
            }
            finger.last = direction;
            if (this._queue.length < AppInputSwipe.QUEUE_SIZE) {
                this._queue.push(direction);
            }
        }
    }

    _end(event) {
        for (const touch of event.changedTouches) {
            this._fingers.delete(touch.identifier);
        }
    }
}

AppInputSwipe.LEFT              = 'left';
AppInputSwipe.RIGHT             = 'right';
AppInputSwipe.UP                = 'up';
AppInputSwipe.DOWN              = 'down';
AppInputSwipe.DEFAULT_THRESHOLD = 0.06;
AppInputSwipe.QUEUE_SIZE        = 4;
