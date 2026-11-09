/**
 * Plays animation clips on a pose: time, speed, loop, the events crossed,
 * the cross-fade from one clip to the next (the clip left keeps playing on a
 * second pose, blended out along a smoothstep) and the root motion (the
 * horizontal travel of a root joint, taken out of the pose and handed to the
 * game). Allocates nothing by frame.
 */
class AnimationPlayer {
    /**
     * @param {SkeletonPose} pose - written at each advance
     */
    constructor(pose) {
        this._pose         = pose;
        this._fadePose     = new SkeletonPose(pose.getSkeleton());
        this._current      = AnimationPlayer._track();
        this._previous     = AnimationPlayer._track();
        this._fadeDuration = 0;
        this._fadeElapsed  = 0;
        this._crossed      = [];
        this._rootJoint    = null;
        this._rootByClip   = new Map();
        this._rootMotion   = new Float32Array(AnimationPlayer.ROOT_MOTION_SIZE);
        this._rootSample   = new Float32Array(Skeleton.TRANSLATION_SIZE);
        this._rootCursor   = AnimationSampler.createCursor();
    }

    /**
     * The joint whose horizontal travel (x, z of its translation) is root motion: taken out of the pose, which keeps
     * the joint's x and z of the clip's start, and handed by getRootMotion.
     *
     * @param {int|null} joint - null: none
     */
    setRootMotion(joint) {
        this._rootJoint = joint;
        this._rootByClip.clear();
        this._rootMotion.fill(0);
        this._anchorRoot(this._current);
        this._anchorRoot(this._previous);

        return this;
    }

    /**
     * The travel of the root joint over the last advance, blended as the poses are during a cross-fade.
     *
     * @param {Float32Array} out - [dx, dz] in the model's space, metres
     */
    getRootMotion(out) {
        out[0] = this._rootMotion[0];
        out[1] = this._rootMotion[1];

        return out;
    }

    /**
     * Starts a clip at once.
     *
     * @param {AnimationClip} clip
     * @param {{time?: number, speed?: number, loop?: boolean}} options - time below 0 = a delay holding the first
     *        pose; speed 1 by default
     */
    play(clip, options = {}) {
        this._start(this._current, clip, options);
        this._fadeDuration = 0;
        this._previous.clip = null;

        return this;
    }

    /**
     * Starts a clip, the one playing fading out over duration seconds.
     *
     * @param {AnimationClip} clip
     * @param {number}        duration
     * @param {{time?: number, speed?: number, loop?: boolean}} options
     */
    crossFadeTo(clip, duration, options = {}) {
        if ((this._current.clip === null) || (duration <= 0)) {
            return this.play(clip, options);
        }
        const left = this._current;

        this._current  = this._previous;
        this._previous = left;
        this._start(this._current, clip, options);
        this._fadeDuration = duration;
        this._fadeElapsed  = 0;

        return this;
    }

    getClip() {
        return this._current.clip;
    }

    getTime() {
        return this._current.time;
    }

    getSpeed() {
        return this._current.speed;
    }

    /**
     * The speed of the clip playing, from the next advance on; the clip fading out keeps its own.
     *
     * @param {number} speed - 1: the clip's own pace
     */
    setSpeed(speed) {
        this._current.speed = speed;

        return this;
    }

    isFinished() {
        const track = this._current;

        return ((track.clip !== null) && !track.loop && (track.time >= track.clip.getDuration()));
    }

    isFading() {
        return (this._fadeDuration > 0);
    }

    /**
     * Moves the time on and writes the pose; the events are those of the clip playing, not of the one fading out.
     *
     * @param {number}           dt        - seconds
     * @param {AnimationEvent[]} eventsOut - emptied, then filled in time order
     */
    advance(dt, eventsOut) {
        const current = this._current;

        eventsOut.length = 0;
        this._rootMotion.fill(0);
        if (current.clip === null) {
            return eventsOut;
        }
        this._step(current, dt, eventsOut);
        this._pose.reset();
        current.clip.applyTo(this._pose, current.time, current.cursors);
        this._takeRootMotion(current, this._pose, 1);
        if (this._fadeDuration > 0) {
            this._fade(dt);
        }

        return eventsOut;
    }

    _fade(dt) {
        const previous = this._previous;

        this._fadeElapsed += dt;
        if (this._fadeElapsed >= this._fadeDuration) {
            this._fadeDuration = 0;
            previous.clip = null;
            return;
        }
        this._step(previous, dt, null);
        this._fadePose.reset();
        previous.clip.applyTo(this._fadePose, previous.time, previous.cursors);
        // Smoothstep: the weights start and end with no speed, the blend adds no jump of its own.
        const share = (this._fadeElapsed / this._fadeDuration);
        const eased = ((3 * share * share) - (2 * share * share * share));
        this._rootMotion[0] *= eased;
        this._rootMotion[1] *= eased;
        this._takeRootMotion(previous, this._fadePose, (1 - eased));
        this._pose.blend(this._fadePose, (1 - eased));
    }

    /**
     * Adds the root joint's travel since the track's last step (whole turns of a loop included) to the root motion,
     * weighted, then puts the joint back on its x and z of the clip's start.
     */
    _takeRootMotion(track, pose, weight) {
        const root = this._rootOf(track.clip);
        if (root === null) {
            return;
        }
        const translation = pose.getTranslation();
        const x           = (this._rootJoint * Skeleton.TRANSLATION_SIZE);
        const z           = (x + AnimationPlayer.Z_COMPONENT);
        const dx          = ((translation[x] - track.rootX) + (track.turns * (root.endX - root.startX)));
        const dz          = ((translation[z] - track.rootZ) + (track.turns * (root.endZ - root.startZ)));

        this._rootMotion[0] += (dx * weight);
        this._rootMotion[1] += (dz * weight);
        track.rootX    = translation[x];
        track.rootZ    = translation[z];
        translation[x] = root.startX;
        translation[z] = root.startZ;
    }

    /**
     * The root joint's translation channel in a clip and its x, z at the clip's start and end, kept per clip; null
     * without root motion or when the clip does not move the root joint.
     */
    _rootOf(clip) {
        if (this._rootJoint === null) {
            return null;
        }
        if (!this._rootByClip.has(clip)) {
            this._rootByClip.set(clip, this._measureRoot(clip));
        }

        return this._rootByClip.get(clip);
    }

    _measureRoot(clip) {
        const channel = clip.getChannels().find((c) => ((c.getJoint() === this._rootJoint) && (c.getPath() === AnimationChannel.TRANSLATION)));
        if (channel === undefined) {
            return null;
        }
        const start  = this._sampleRoot(channel, 0);
        const startX = start[0];
        const startZ = start[AnimationPlayer.Z_COMPONENT];
        const end    = this._sampleRoot(channel, clip.getDuration());

        return Object.freeze({channel: channel, startX: startX, startZ: startZ, endX: end[0], endZ: end[AnimationPlayer.Z_COMPONENT]});
    }

    // A root translation channel at a time, in a buffer of the player (overwritten by the next call).
    _sampleRoot(channel, time) {
        channel.getSampler().sample(time, this._rootCursor, this._rootSample, 0);

        return this._rootSample;
    }

    // The track's root joint taken where its clip stands: no travel is counted for its next step.
    _anchorRoot(track) {
        const root = ((track.clip === null) ? null : this._rootOf(track.clip));
        if (root === null) {
            return;
        }
        const at = this._sampleRoot(root.channel, track.time);
        track.rootX = at[0];
        track.rootZ = at[AnimationPlayer.Z_COMPONENT];
    }

    // A looping clip reports the events of each turn, its start included.
    _step(track, dt, eventsOut) {
        const clip     = track.clip;
        const duration = clip.getDuration();
        let t0    = track.time;
        let t1    = (t0 + (dt * track.speed));
        let start = track.fresh;

        track.fresh = false;
        track.turns = 0;
        if (track.loop && (duration > 0)) {
            while (t1 > duration) {
                this._collect(clip, t0, duration, start, eventsOut);
                t0    = 0;
                t1   -= duration;
                start = true;
                track.turns++;
            }
        } else {
            t1 = Math.min(t1, duration);
        }
        this._collect(clip, t0, t1, start, eventsOut);
        track.time = t1;
    }

    _collect(clip, t0, t1, includeStart, eventsOut) {
        if (eventsOut === null) {
            return;
        }
        clip.eventsBetween(t0, t1, this._crossed, includeStart);
        for (const event of this._crossed) {
            eventsOut.push(event);
        }
    }

    static _track() {
        return {clip: null, cursors: null, cursorsByClip: new Map(), time: 0, speed: 1, loop: false, fresh: false, turns: 0, rootX: 0, rootZ: 0};
    }

    // Cursors kept per clip and per track: a clip played again reuses them.
    _start(track, clip, options) {
        if (!track.cursorsByClip.has(clip)) {
            track.cursorsByClip.set(clip, clip.createCursors());
        }
        track.clip    = clip;
        track.cursors = track.cursorsByClip.get(clip);
        track.time    = (options.time ?? 0);
        track.speed   = (options.speed ?? 1);
        track.loop    = (options.loop === true);
        track.fresh   = true;
        this._anchorRoot(track);
    }
}

// Root motion: [dx, dz]; z is the third component of a translation.
AnimationPlayer.ROOT_MOTION_SIZE = 2;
AnimationPlayer.Z_COMPONENT      = 2;
