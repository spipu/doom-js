var __typeError = (msg) => {
  throw TypeError(msg);
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
var __privateWrapper = (obj, member, setter, getter) => ({
  set _(value) {
    __privateSet(obj, member, value, setter);
  },
  get _() {
    return __privateGet(obj, member, getter);
  }
});

// src/utils/constants.js
var Emulator = Object.freeze({
  /** Nuked OPL3 v1.8 - Most accurate, higher CPU usage */
  NUKED: 0,
  /** Optimized Nuked 1.8 fork by tgies with identical output */
  NUKED_FAST: 1,
  /** @deprecated Use NUKED_FAST */
  NUKED_174: 1,
  /** DosBox OPL3 - Good accuracy, lower CPU usage */
  DOSBOX: 2,
  /** Opal - Reality Adlib Tracker emulator */
  OPAL: 3,
  /** Java OPL3 - Port of emu8950 */
  JAVA: 4,
  /** ESFMu - ESFM chip emulator */
  ESFMu: 5,
  /** MAME OPL2 */
  MAME_OPL2: 6,
  /** YMFM OPL2 */
  YMFM_OPL2: 7,
  /** YMFM OPL3 */
  YMFM_OPL3: 8,
  /** Nuked OPL2 LLE - Transistor-level emulation */
  NUKED_OPL2_LLE: 9,
  /** Nuked OPL3 LLE - Transistor-level emulation */
  NUKED_OPL3_LLE: 10,
  /** Nuked OPL2 Lite - Lightweight OPL2 emulation for AdLib-era music */
  NUKED_OPL2_LITE: 11
});
var TrackOption = Object.freeze({
  /** Enable the track (default state) */
  ON: 1,
  /** Mute/disable the track */
  OFF: 2,
  /** Solo the track (mute all others) */
  SOLO: 3
});

// src/libadlmidi.js
var _ready, _messageHandlers, _nextRequestId, _AdlMidi_instances, handleMessage_fn, onceMessage_fn, onceCorrelatedMessage_fn, send_fn;
var AdlMidi = class {
  /**
   * Create a new AdlMidi instance
   * @param {AudioContext} [context] - Optional AudioContext to use. Creates one if not provided.
   */
  constructor(context) {
    __privateAdd(this, _AdlMidi_instances);
    /** @type {boolean} */
    __privateAdd(this, _ready, false);
    /** @type {Map<string, Set<Function>>} */
    __privateAdd(this, _messageHandlers, /* @__PURE__ */ new Map());
    /** @type {number} */
    __privateAdd(this, _nextRequestId, 0);
    this.ctx = context || null;
    this.node = null;
  }
  /**
   * Get the AudioContext (may be null before init)
   * @returns {AudioContext | null}
   */
  get audioContext() {
    return this.ctx;
  }
  /**
   * Check if the synth is ready
   * @returns {boolean}
   */
  get ready() {
    return __privateGet(this, _ready);
  }
  /**
   * Initialize the synthesizer
   * @param {string} processorUrl - URL to the bundled processor JavaScript file
   * @param {string | null} [wasmUrl=null] - Optional URL to the .wasm file for split builds.
   *                             If not provided, assumes bundled version with embedded WASM.
   * @param {object} [defaultSettings={}] - Initial synth settings applied before ready.
   *                             Profile wrappers use this to set a default emulator.
   * @returns {Promise<void>}
   */
  async init(processorUrl, wasmUrl = null, defaultSettings = {}) {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 44100 });
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    const effectiveWasmUrl = wasmUrl || processorUrl.replace(".processor.js", ".core.wasm");
    const response = await fetch(effectiveWasmUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch WASM: ${response.status}`);
    }
    const wasmBinary = await response.arrayBuffer();
    await this.ctx.audioWorklet.addModule(processorUrl);
    this.node = new AudioWorkletNode(this.ctx, "adl-midi-processor", {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: this.ctx.sampleRate,
        wasmBinary,
        // null for bundled, ArrayBuffer for split
        settings: defaultSettings
      }
    });
    this.node.connect(this.ctx.destination);
    this.node.port.onmessage = (e) => __privateMethod(this, _AdlMidi_instances, handleMessage_fn).call(this, e.data);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for WASM initialization"));
      }, 1e4);
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(this, "ready", () => {
        clearTimeout(timeout);
        __privateSet(this, _ready, true);
        resolve();
      });
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "error",
        /** @param {{message: string}} msg */
        (msg) => {
          clearTimeout(timeout);
          reject(new Error(msg.message));
        }
      );
    });
  }
  /**
   * Play a note
   * @param {number} channel - MIDI channel (0-15)
   * @param {number} note - MIDI note number (0-127)
   * @param {number} velocity - Note velocity (0-127)
   */
  noteOn(channel, note, velocity) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "noteOn", channel, note, velocity });
  }
  /**
   * Stop a note
   * @param {number} channel - MIDI channel (0-15)
   * @param {number} note - MIDI note number (0-127)
   */
  noteOff(channel, note) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "noteOff", channel, note });
  }
  /**
   * Set pitch bend
   * @param {number} channel - MIDI channel (0-15)
   * @param {number} value - Pitch bend value (0-16383, 8192 = center)
   */
  pitchBend(channel, value) {
    const lsb = value & 127;
    const msb = value >> 7 & 127;
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "pitchBend", channel, lsb, msb });
  }
  /**
   * Send a control change
   * @param {number} channel - MIDI channel (0-15)
   * @param {number} controller - Controller number (0-127)
   * @param {number} value - Controller value (0-127)
   */
  controlChange(channel, controller, value) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "controlChange", channel, controller, value });
  }
  /**
   * Change program (instrument)
   * @param {number} channel - MIDI channel (0-15)
   * @param {number} program - Program number (0-127)
   */
  programChange(channel, program) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "programChange", channel, program });
  }
  /**
   * Send note aftertouch
   * @param {number} channel - MIDI channel (0-15)
   * @param {number} note - Note number (0-127)
   * @param {number} pressure - Pressure (0-127)
   */
  noteAfterTouch(channel, note, pressure) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "noteAfterTouch", channel, note, pressure });
  }
  /**
   * Send channel aftertouch
   * @param {number} channel - MIDI channel (0-15)
   * @param {number} pressure - Pressure (0-127)
   */
  channelAfterTouch(channel, pressure) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "channelAfterTouch", channel, pressure });
  }
  /**
   * Change bank (16-bit)
   * @param {number} channel - MIDI channel (0-15)
   * @param {number} bank - Bank number
   */
  bankChange(channel, bank) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "bankChange", channel, bank });
  }
  /**
   * Change bank MSB
   * @param {number} channel - MIDI channel (0-15)
   * @param {number} msb - Bank MSB (0-127)
   */
  bankChangeMSB(channel, msb) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "bankChangeMSB", channel, msb });
  }
  /**
   * Change bank LSB
   * @param {number} channel - MIDI channel (0-15)
   * @param {number} lsb - Bank LSB (0-127)
   */
  bankChangeLSB(channel, lsb) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "bankChangeLSB", channel, lsb });
  }
  /**
   * Reset the real-time state (stops all notes, resets controllers)
   * @returns {void}
   */
  resetState() {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "resetState" });
  }
  /**
   * Panic - stop all sounds immediately
   * @returns {void}
   */
  panic() {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "panic" });
  }
  // ================== Raw OPL3 API ==================
  /**
   * Write a raw OPL3 register on a specific chip (fire-and-forget).
   *
   * Bypasses the MIDI voice allocator. Reserve channels first via
   * {@link reserveChipChannels} to prevent the MIDI driver from
   * overwriting your register state.
   *
   * @param {number} chipId - Zero-based chip index (0 to getNumChipsObtained()-1)
   * @param {number} reg - OPL3 register address (0x000-0x1FF, bit 8 selects bank)
   * @param {number} value - Register value (0-255)
   */
  rawOPL3(chipId, reg, value) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "rawOPL3", chipId, reg, value });
  }
  /**
   * Reserve chip channels so the MIDI voice allocator will not use them.
   *
   * After reservation, use {@link rawOPL3} to drive those channels
   * directly. Pass channelMask = 0 to release all reservations.
   *
   * @param {number} chipId - Zero-based chip index (0 to getNumChipsObtained()-1)
   * @param {number} channelMask - Bitmask of per-chip channels to reserve
   *   (bits 0-22, where bit N reserves per-chip channel N)
   * @returns {Promise<void>}
   */
  async reserveChipChannels(chipId, channelMask) {
    const reqId = __privateWrapper(this, _nextRequestId)._++;
    return new Promise((resolve, reject) => {
      __privateMethod(this, _AdlMidi_instances, onceCorrelatedMessage_fn).call(
        this,
        "chipChannelsReserved",
        reqId,
        /** @param {{success: boolean}} msg */
        (msg) => {
          if (msg.success) {
            resolve();
          } else {
            reject(new Error(`Failed to reserve chip channels on chip ${chipId}`));
          }
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "reserveChipChannels", chipId, channelMask, reqId });
    });
  }
  /**
   * Read back the chip-channel reservation mask.
   *
   * @param {number} chipId - Zero-based chip index
   * @returns {Promise<number>} Reservation bitmask (0 if invalid chipId)
   */
  async getReservedChipChannels(chipId) {
    const reqId = __privateWrapper(this, _nextRequestId)._++;
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceCorrelatedMessage_fn).call(
        this,
        "reservedChipChannels",
        reqId,
        /** @param {{mask: number}} msg */
        (msg) => {
          resolve(msg.mask);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getReservedChipChannels", chipId, reqId });
    });
  }
  /**
   * Configure synth settings at runtime
   * @param {ConfigureSettings} settings - Settings object
   * @returns {Promise<void>}
   */
  async configure(settings) {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(this, "configured", () => resolve());
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "configure", settings });
    });
  }
  /**
   * Load a custom bank file (WOPL format)
   * @param {ArrayBuffer} arrayBuffer - Bank file data
   * @returns {Promise<void>}
   */
  async loadBankData(arrayBuffer) {
    return new Promise((resolve, reject) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "bankLoaded",
        /** @param {{success: boolean, error?: string}} msg */
        (msg) => {
          if (msg.success) {
            resolve();
          } else {
            reject(new Error(msg.error || "Failed to load bank"));
          }
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "loadBankData", data: arrayBuffer });
    });
  }
  /**
   * Set the embedded bank by number
   * @param {number} bank - Bank number
   * @returns {Promise<void>}
   */
  async setBank(bank) {
    return new Promise((resolve, reject) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "bankSet",
        /** @param {{success: boolean}} msg */
        (msg) => {
          if (msg.success) {
            resolve();
          } else {
            reject(new Error(`Failed to set bank ${bank}`));
          }
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setBank", bank });
    });
  }
  /**
   * Get an instrument from a bank for editing
   * @param {BankId} [bankId] - Bank identifier
   * @param {number} [programNumber] - Program/instrument number (0-127)
   * @returns {Promise<Instrument>} Instrument object with named properties
   */
  async getInstrument(bankId = { percussive: false, msb: 0, lsb: 0 }, programNumber = 0) {
    return new Promise((resolve, reject) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "instrumentLoaded",
        /** @param {{success: boolean, instrument: Instrument, error?: string}} msg */
        (msg) => {
          if (msg.success) {
            resolve(msg.instrument);
          } else {
            reject(new Error(msg.error || "Failed to get instrument"));
          }
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getInstrument", bankId, programNumber });
    });
  }
  /**
   * Set an instrument in a bank
   * @param {BankId} bankId - Bank identifier
   * @param {number} programNumber - Program/instrument number (0-127)
   * @param {Instrument} instrument - Instrument object with operator parameters
   * @returns {Promise<void>}
   */
  async setInstrument(bankId = { percussive: false, msb: 0, lsb: 0 }, programNumber, instrument) {
    return new Promise((resolve, reject) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "instrumentSet",
        /** @param {{success: boolean, error?: string}} msg */
        (msg) => {
          if (msg.success) {
            resolve();
          } else {
            reject(new Error(msg.error || "Failed to set instrument"));
          }
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setInstrument", bankId, programNumber, instrument });
    });
  }
  /**
   * Set the number of emulated OPL3 chips
   * @param {number} chips - Number of chips (1-100)
   */
  setNumChips(chips) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setNumChips", chips });
  }
  /**
   * Set the number of 4-operator channels
   * @param {number} channels - Number of channels (-1 for auto)
   */
  setNumFourOpChannels(channels) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setNumFourOpChannels", channels });
  }
  /**
   * Get the number of 4-operator channels
   * @returns {Promise<number>}
   */
  async getNumFourOpChannels() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "numFourOpChannels",
        /** @param {{channels: number}} msg */
        (msg) => {
          resolve(msg.channels);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getNumFourOpChannels" });
    });
  }
  /**
   * Get the number of 4-operator channels obtained
   * @returns {Promise<number>}
   */
  async getNumFourOpChannelsObtained() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "numFourOpChannelsObtained",
        /** @param {{channels: number}} msg */
        (msg) => {
          resolve(msg.channels);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getNumFourOpChannelsObtained" });
    });
  }
  /**
   * Enable/disable scaling of modulators by volume
   * @param {boolean} enabled
   */
  setScaleModulators(enabled) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setScaleModulators", enabled });
  }
  /**
   * Enable/disable full-range brightness
   * @param {boolean} enabled
   */
  setFullRangeBrightness(enabled) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setFullRangeBrightness", enabled });
  }
  /**
   * Enable/disable automatic arpeggio
   * @param {boolean} enabled
   */
  setAutoArpeggio(enabled) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setAutoArpeggio", enabled });
  }
  /**
   * Get automatic arpeggio state
   * @returns {Promise<boolean>}
   */
  async getAutoArpeggio() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "autoArpeggio",
        /** @param {{enabled: boolean}} msg */
        (msg) => {
          resolve(msg.enabled);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getAutoArpeggio" });
    });
  }
  /**
   * Set channel allocation mode
   * @param {number} mode - Mode ID
   */
  setChannelAllocMode(mode) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setChannelAllocMode", mode });
  }
  /**
   * Get channel allocation mode
   * @returns {Promise<number>}
   */
  async getChannelAllocMode() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "channelAllocMode",
        /** @param {{mode: number}} msg */
        (msg) => {
          resolve(msg.mode);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getChannelAllocMode" });
    });
  }
  /**
   * Set the volume range model
   * @param {number} model - Volume model number
   */
  setVolumeRangeModel(model) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setVolumeRangeModel", model });
  }
  /**
   * Enable/disable soft stereo panning
   * @param {boolean} enabled
   */
  setSoftPanEnabled(enabled) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setSoftPanEnabled", enabled });
  }
  /**
   * Enable/disable deep vibrato
   * @param {boolean} enabled
   */
  setDeepVibrato(enabled) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setDeepVibrato", enabled });
  }
  /**
   * Get deep vibrato state
   * @returns {Promise<boolean>}
   */
  async getDeepVibrato() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "deepVibrato",
        /** @param {{enabled: boolean}} msg */
        (msg) => {
          resolve(msg.enabled);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getDeepVibrato" });
    });
  }
  /**
   * Enable/disable deep tremolo
   * @param {boolean} enabled
   */
  setDeepTremolo(enabled) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setDeepTremolo", enabled });
  }
  /**
   * Get deep tremolo state
   * @returns {Promise<boolean>}
   */
  async getDeepTremolo() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "deepTremolo",
        /** @param {{enabled: boolean}} msg */
        (msg) => {
          resolve(msg.enabled);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getDeepTremolo" });
    });
  }
  /**
   * Run emulator with PCM rate to reduce CPU usage
   * @param {boolean} enabled
   */
  setRunAtPcmRate(enabled) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setRunAtPcmRate", enabled });
  }
  /**
   * Switch the OPL3 emulator core at runtime
   * 
   * Only emulators compiled into the current build profile are available:
   * - nuked profile: NUKED only
   * - dosbox profile: DOSBOX only  
   * - light profile: NUKED, DOSBOX
   * - full profile: NUKED, DOSBOX, OPAL, JAVA, ESFMu, YMFM_OPL2, YMFM_OPL3
   * 
   * @param {number} emulator - Emulator ID from the Emulator enum
   * @returns {Promise<void>} Resolves when emulator is switched, rejects if unavailable
   * @example
   * import { AdlMidi, Emulator } from 'libadlmidi-js';
   * await synth.switchEmulator(Emulator.DOSBOX);
   */
  async switchEmulator(emulator) {
    return new Promise((resolve, reject) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "emulatorSwitched",
        /** @param {{success: boolean, emulator: number}} msg */
        (msg) => {
          if (msg.success) {
            resolve();
          } else {
            reject(new Error(`Failed to switch to emulator ${emulator}. It may not be available in this build profile.`));
          }
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "switchEmulator", emulator });
    });
  }
  /**
   * Get the name of the currently active OPL3 emulator
   * @returns {Promise<string>} Human-readable emulator name (e.g., "Nuked OPL3 (v 1.8)")
   * @example
   * const name = await synth.getEmulatorName();
   * console.log(`Using: ${name}`);
   */
  async getEmulatorName() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "emulatorName",
        /** @param {{name: string}} msg */
        (msg) => {
          resolve(msg.name);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getEmulatorName" });
    });
  }
  /**
   * Get the last error info for the player instance
   * @returns {Promise<string>}
   */
  async getErrorInfo() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "errorInfo",
        /** @param {{info: string}} msg */
        (msg) => {
          resolve(msg.info);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getErrorInfo" });
    });
  }
  /**
   * Get the version string of the linked libADLMIDI library
   * @returns {Promise<string>}
   */
  async getLibraryVersion() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "libraryVersion",
        /** @param {{version: string}} msg */
        (msg) => {
          resolve(msg.version);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getLibraryVersion" });
    });
  }
  /**
   * Get the version of the linked libADLMIDI library as an object
   * @returns {Promise<{major: number, minor: number, patch: number}>}
   */
  async getVersion() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "version",
        /** @param {{version: {major: number, minor: number, patch: number}}} msg */
        (msg) => {
          resolve(msg.version);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getVersion" });
    });
  }
  /**
   * Get the number of emulated chips
   * @returns {Promise<number>}
   */
  async getNumChips() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "numChips",
        /** @param {{chips: number}} msg */
        (msg) => {
          resolve(msg.chips);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getNumChips" });
    });
  }
  /**
   * Get the number of emulated chips obtained
   * @returns {Promise<number>}
   */
  async getNumChipsObtained() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "numChipsObtained",
        /** @param {{chips: number}} msg */
        (msg) => {
          resolve(msg.chips);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getNumChipsObtained" });
    });
  }
  /**
   * Get the volume range model
   * @returns {Promise<number>}
   */
  async getVolumeRangeModel() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "volumeRangeModel",
        /** @param {{model: number}} msg */
        (msg) => {
          resolve(msg.model);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getVolumeRangeModel" });
    });
  }
  /**
   * Get list of embedded banks available in this build
   * Note: Slim builds have no embedded banks and will return an empty array
   * @returns {Promise<{id: number, name: string}[]>} Array of bank info objects
   * @example
   * const banks = await synth.getEmbeddedBanks();
   * banks.forEach(b => console.log(`${b.id}: ${b.name}`));
   */
  async getEmbeddedBanks() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "embeddedBanks",
        /** @param {{banks: {id: number, name: string}[]}} msg */
        (msg) => {
          resolve(msg.banks);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getEmbeddedBanks" });
    });
  }
  // ================== Bank Management API ==================
  /**
   * Reserve a number of banks
   * @param {number} count - Number of banks to reserve
   * @returns {Promise<void>} Resolves on success, rejects on failure
   */
  async reserveBanks(count) {
    const reqId = __privateWrapper(this, _nextRequestId)._++;
    return new Promise((resolve, reject) => {
      __privateMethod(this, _AdlMidi_instances, onceCorrelatedMessage_fn).call(
        this,
        "banksReserved",
        reqId,
        /** @param {{success: boolean}} msg */
        (msg) => {
          if (msg.success) {
            resolve();
          } else {
            reject(new Error("Failed to reserve banks"));
          }
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "reserveBanks", count, reqId });
    });
  }
  /**
   * Get the bank ID for a given bank identifier
   * @param {BankId} bankId - Bank identifier
   * @returns {Promise<{percussive: number, msb: number, lsb: number}|null>} Bank ID or null if not found
   */
  async getBankId(bankId) {
    const reqId = __privateWrapper(this, _nextRequestId)._++;
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceCorrelatedMessage_fn).call(
        this,
        "bankId",
        reqId,
        /** @param {{id: {percussive: number, msb: number, lsb: number}|null}} msg */
        (msg) => {
          resolve(msg.id);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getBankId", bankId, reqId });
    });
  }
  /**
   * Remove a bank by its identifier
   * @param {BankId} bankId - Bank identifier
   * @returns {Promise<void>} Resolves on success, rejects on failure
   */
  async removeBank(bankId) {
    const reqId = __privateWrapper(this, _nextRequestId)._++;
    return new Promise((resolve, reject) => {
      __privateMethod(this, _AdlMidi_instances, onceCorrelatedMessage_fn).call(
        this,
        "bankRemoved",
        reqId,
        /** @param {{success: boolean}} msg */
        (msg) => {
          if (msg.success) {
            resolve();
          } else {
            reject(new Error("Failed to remove bank"));
          }
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "removeBank", bankId, reqId });
    });
  }
  /**
   * Load an embedded bank into a custom bank slot
   * @param {BankId} bankId - Target bank identifier
   * @param {number} num - Embedded bank number to load
   * @returns {Promise<void>} Resolves on success, rejects on failure
   */
  async loadEmbeddedBank(bankId, num) {
    const reqId = __privateWrapper(this, _nextRequestId)._++;
    return new Promise((resolve, reject) => {
      __privateMethod(this, _AdlMidi_instances, onceCorrelatedMessage_fn).call(
        this,
        "embeddedBankLoaded",
        reqId,
        /** @param {{success: boolean}} msg */
        (msg) => {
          if (msg.success) {
            resolve();
          } else {
            reject(new Error("Failed to load embedded bank"));
          }
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "loadEmbeddedBank", bankId, num, reqId });
    });
  }
  // ================== SysEx API ==================
  /**
   * Send a System Exclusive (SysEx) message
   * @param {Uint8Array|ArrayBuffer} data - SysEx message data
   * @returns {Promise<void>} Resolves on success, rejects on failure
   */
  async systemExclusive(data) {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    const reqId = __privateWrapper(this, _nextRequestId)._++;
    return new Promise((resolve, reject) => {
      __privateMethod(this, _AdlMidi_instances, onceCorrelatedMessage_fn).call(
        this,
        "systemExclusiveSent",
        reqId,
        /** @param {{success: boolean}} msg */
        (msg) => {
          if (msg.success) {
            resolve();
          } else {
            reject(new Error("Failed to send system exclusive message"));
          }
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "systemExclusive", data: Array.from(bytes), reqId });
    });
  }
  // ================== Debug / Diagnostics API ==================
  /**
   * Describe the current state of all channels (debug utility)
   * @returns {Promise<{text: string, attr: Uint8Array}>} Channel state text and raw per-channel attribute bytes
   */
  async describeChannels() {
    const reqId = __privateWrapper(this, _nextRequestId)._++;
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceCorrelatedMessage_fn).call(
        this,
        "channelsDescribed",
        reqId,
        /** @param {{text: string, attr: number[]}} msg */
        (msg) => {
          resolve({ text: msg.text, attr: new Uint8Array(msg.attr) });
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "describeChannels", reqId });
    });
  }
  /**
   * Reset the synthesizer
   * @returns {void}
   */
  reset() {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "reset" });
  }
  // ================== MIDI File Playback API ==================
  /**
   * Load a MIDI file for playback
   * @param {ArrayBuffer} arrayBuffer - MIDI file data
   * @returns {Promise<{duration: number}>} Resolves with file info when loaded
   */
  async loadMidi(arrayBuffer) {
    return new Promise((resolve, reject) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "midiLoaded",
        /** @param {{success: boolean, duration: number, error?: string}} msg */
        (msg) => {
          if (msg.success) {
            resolve({ duration: msg.duration });
          } else {
            reject(new Error(msg.error || "Failed to parse MIDI data"));
          }
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "loadMidi", data: arrayBuffer });
    });
  }
  /**
   * Get the music title of the loaded MIDI file
   * @returns {Promise<string>}
   */
  async getMusicTitle() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "musicTitle",
        /** @param {{title: string}} msg */
        (msg) => {
          resolve(msg.title);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getMusicTitle" });
    });
  }
  /**
   * Get the copyright notice of the loaded MIDI file
   * @returns {Promise<string>}
   */
  async getMusicCopyright() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "musicCopyright",
        /** @param {{copyright: string}} msg */
        (msg) => {
          resolve(msg.copyright);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getMusicCopyright" });
    });
  }
  /**
   * Get the number of track titles in the loaded MIDI file
   * @returns {Promise<number>}
   */
  async getTrackTitleCount() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "trackTitleCount",
        /** @param {{count: number}} msg */
        (msg) => {
          resolve(msg.count);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getTrackTitleCount" });
    });
  }
  /**
   * Get a track title by index
   * @param {number} index - Track title index
   * @returns {Promise<string>}
   */
  async getTrackTitle(index) {
    const reqId = __privateWrapper(this, _nextRequestId)._++;
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceCorrelatedMessage_fn).call(
        this,
        "trackTitle",
        reqId,
        /** @param {{title: string}} msg */
        (msg) => {
          resolve(msg.title);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getTrackTitle", index, reqId });
    });
  }
  /**
   * Get the number of MIDI markers in the loaded file
   * @returns {Promise<number>}
   */
  async getMarkerCount() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "markerCount",
        /** @param {{count: number}} msg */
        (msg) => {
          resolve(msg.count);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getMarkerCount" });
    });
  }
  /**
   * Start or resume MIDI file playback
   * @returns {void}
   */
  play() {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "play" });
  }
  /**
   * Stop MIDI file playback and rewind to beginning
   * @returns {void}
   */
  stop() {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "stop" });
  }
  /**
   * Seek to a position in the MIDI file
   * @param {number} seconds - Position in seconds
   * @returns {void}
   */
  seek(seconds) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "seek", position: seconds });
  }
  /**
   * Enable or disable looping for MIDI file playback
   * @param {boolean} enabled - Whether to loop
   * @returns {void}
   */
  setLoopEnabled(enabled) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setLoopEnabled", enabled });
  }
  /**
   * Set the number of loop repetitions
   * @param {number} count - Loop count (-1 = infinite, 0 = no loops, 1+ = number of loops)
   */
  setLoopCount(count) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setLoopCount", count });
  }
  /**
   * Enable/disable loop hooks only mode
   * @param {boolean} enabled
   */
  setLoopHooksOnly(enabled) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setLoopHooksOnly", enabled });
  }
  /**
   * Get the loop start time in seconds
   * @returns {Promise<number>}
   */
  async getLoopStartTime() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "loopStartTime",
        /** @param {{time: number}} msg */
        (msg) => {
          resolve(msg.time);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getLoopStartTime" });
    });
  }
  /**
   * Get the loop end time in seconds
   * @returns {Promise<number>}
   */
  async getLoopEndTime() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "loopEndTime",
        /** @param {{time: number}} msg */
        (msg) => {
          resolve(msg.time);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getLoopEndTime" });
    });
  }
  /**
   * Select a song number for multi-song MIDI files
   * @param {number} num - Song number (0-based)
   */
  selectSongNum(num) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "selectSongNum", num });
  }
  /**
   * Get the number of songs in the loaded MIDI file
   * @returns {Promise<number>}
   */
  async getSongsCount() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "songsCount",
        /** @param {{count: number}} msg */
        (msg) => {
          resolve(msg.count);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getSongsCount" });
    });
  }
  /**
   * Get the number of tracks in the loaded MIDI file
   * @returns {Promise<number>}
   */
  async getTrackCount() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "trackCount",
        /** @param {{count: number}} msg */
        (msg) => {
          resolve(msg.count);
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getTrackCount" });
    });
  }
  /**
   * Set track options (enable, mute, or solo)
   * Use the TrackOption enum: TrackOption.ON (1), TrackOption.OFF (2), TrackOption.SOLO (3).
   * Note: Passing 0 is a silent no-op that resolves without changing state.
   * @param {number} track - Track index
   * @param {number} options - Track option from TrackOption enum
   * @returns {Promise<void>} Resolves on success, rejects on failure
   */
  async setTrackOptions(track, options) {
    const reqId = __privateWrapper(this, _nextRequestId)._++;
    return new Promise((resolve, reject) => {
      __privateMethod(this, _AdlMidi_instances, onceCorrelatedMessage_fn).call(
        this,
        "trackOptionsSet",
        reqId,
        /** @param {{success: boolean}} msg */
        (msg) => {
          if (msg.success) {
            resolve();
          } else {
            reject(new Error(`Failed to set track options for track ${track}`));
          }
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setTrackOptions", track, options, reqId });
    });
  }
  /**
   * Enable or disable a MIDI channel
   * @param {number} channel - MIDI channel (0-15)
   * @param {boolean} enabled - Whether to enable the channel
   * @returns {Promise<void>} Resolves on success, rejects on failure
   */
  async setChannelEnabled(channel, enabled) {
    const reqId = __privateWrapper(this, _nextRequestId)._++;
    return new Promise((resolve, reject) => {
      __privateMethod(this, _AdlMidi_instances, onceCorrelatedMessage_fn).call(
        this,
        "channelEnabledSet",
        reqId,
        /** @param {{success: boolean}} msg */
        (msg) => {
          if (msg.success) {
            resolve();
          } else {
            reject(new Error(`Failed to set channel ${channel} enabled state`));
          }
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setChannelEnabled", channel, enabled, reqId });
    });
  }
  /**
   * Set the playback tempo multiplier
   * @param {number} tempo - Tempo multiplier (1.0 = normal speed)
   * @returns {void}
   */
  setTempo(tempo) {
    __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "setTempo", tempo });
  }
  /**
   * Get the current playback state
   * @returns {Promise<{position: number, duration: number, atEnd: boolean, playMode: string}>}
   */
  async getPlaybackState() {
    return new Promise((resolve) => {
      __privateMethod(this, _AdlMidi_instances, onceMessage_fn).call(
        this,
        "state",
        /** @param {{position: number, duration: number, atEnd: boolean, playMode: string}} msg */
        (msg) => {
          resolve({
            position: msg.position,
            duration: msg.duration,
            atEnd: msg.atEnd,
            playMode: msg.playMode
          });
        }
      );
      __privateMethod(this, _AdlMidi_instances, send_fn).call(this, { type: "getState" });
    });
  }
  /**
   * Register a handler for playback state updates
   * Useful for progress tracking during playback
   * @param {function({position: number, duration: number, atEnd: boolean, playMode: string}): void} handler
   * @returns {function(): void} Unsubscribe function
   */
  onPlaybackState(handler) {
    if (!__privateGet(this, _messageHandlers).has("state")) {
      __privateGet(this, _messageHandlers).set("state", /* @__PURE__ */ new Set());
    }
    __privateGet(this, _messageHandlers).get("state")?.add(handler);
    return () => {
      __privateGet(this, _messageHandlers).get("state")?.delete(handler);
    };
  }
  /**
   * Register a handler for when playback ends naturally
   * @param {function(): void} handler
   * @returns {function(): void} Unsubscribe function
   */
  onPlaybackEnded(handler) {
    if (!__privateGet(this, _messageHandlers).has("playbackEnded")) {
      __privateGet(this, _messageHandlers).set("playbackEnded", /* @__PURE__ */ new Set());
    }
    __privateGet(this, _messageHandlers).get("playbackEnded")?.add(handler);
    return () => {
      __privateGet(this, _messageHandlers).get("playbackEnded")?.delete(handler);
    };
  }
  /**
   * Close the synthesizer and release resources
   * @returns {void}
   */
  close() {
    if (this.node) {
      this.node.disconnect();
      this.node = null;
    }
    __privateSet(this, _ready, false);
  }
  /**
   * Suspend the AudioContext (save CPU when not in use)
   * @returns {Promise<void>}
   */
  async suspend() {
    if (this.ctx) {
      await this.ctx.suspend();
    }
  }
  /**
   * Resume the AudioContext
   * @returns {Promise<void>}
   */
  async resume() {
    if (this.ctx) {
      await this.ctx.resume();
    }
  }
};
_ready = new WeakMap();
_messageHandlers = new WeakMap();
_nextRequestId = new WeakMap();
_AdlMidi_instances = new WeakSet();
/**
 * Internal message handler
 * @param {{type: string}} msg - Message from processor
 */
handleMessage_fn = function(msg) {
  const handlers = __privateGet(this, _messageHandlers).get(msg.type);
  if (handlers) {
    handlers.forEach(
      /** @param {Function} handler */
      (handler) => handler(msg)
    );
  }
};
/**
 * Register a one-time message handler
 * @param {string} type - Message type
 * @param {Function} handler - Handler function
 */
onceMessage_fn = function(type, handler) {
  if (!__privateGet(this, _messageHandlers).has(type)) {
    __privateGet(this, _messageHandlers).set(type, /* @__PURE__ */ new Set());
  }
  const wrappedHandler = (msg) => {
    __privateGet(this, _messageHandlers).get(type)?.delete(wrappedHandler);
    handler(msg);
  };
  __privateGet(this, _messageHandlers).get(type)?.add(wrappedHandler);
};
/**
 * Register a one-time handler correlated by request ID.
 * Allows concurrent operations of the same type without reply misrouting.
 * @param {string} type - Message type
 * @param {number} reqId - Request ID to match against
 * @param {Function} handler - Handler function
 */
onceCorrelatedMessage_fn = function(type, reqId, handler) {
  if (!__privateGet(this, _messageHandlers).has(type)) {
    __privateGet(this, _messageHandlers).set(type, /* @__PURE__ */ new Set());
  }
  const filteredHandler = (msg) => {
    if (msg.reqId === reqId) {
      __privateGet(this, _messageHandlers).get(type)?.delete(filteredHandler);
      handler(msg);
    }
  };
  __privateGet(this, _messageHandlers).get(type)?.add(filteredHandler);
};
/**
 * Send a message to the processor
 * @param {Object} msg - Message to send
 */
send_fn = function(msg) {
  if (this.node) {
    this.node.port.postMessage(msg);
  }
};
window.AdlMidi            = AdlMidi;
window.AdlMidiEmulator    = Emulator;
window.AdlMidiTrackOption = TrackOption;
