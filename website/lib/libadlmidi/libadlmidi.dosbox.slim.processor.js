if (typeof URL === 'undefined') { globalThis.URL = class URL { constructor(url, base) { this.href = url; } }; }
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// dist/libadlmidi.dosbox.slim.browser.js
async function createADLMIDI(moduleArg = {}) {
  var moduleRtn;
  var Module = moduleArg;
  var ENVIRONMENT_IS_WEB = !!globalThis.window;
  var ENVIRONMENT_IS_WORKER = !!globalThis.WorkerGlobalScope;
  var ENVIRONMENT_IS_NODE = globalThis.process?.versions?.node && globalThis.process?.type != "renderer";
  var arguments_ = [];
  var thisProgram = "./this.program";
  var quit_ = (status, toThrow) => {
    throw toThrow;
  };
  var _scriptName = import.meta.url;
  var scriptDirectory = "";
  function locateFile(path) {
    if (Module["locateFile"]) {
      return Module["locateFile"](path, scriptDirectory);
    }
    return scriptDirectory + path;
  }
  var readAsync, readBinary;
  if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    try {
      scriptDirectory = new URL(".", _scriptName).href;
    } catch {
    }
    {
      if (ENVIRONMENT_IS_WORKER) {
        readBinary = (url) => {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, false);
          xhr.responseType = "arraybuffer";
          xhr.send(null);
          return new Uint8Array(xhr.response);
        };
      }
      readAsync = async (url) => {
        var response = await fetch(url, { credentials: "same-origin" });
        if (response.ok) {
          return response.arrayBuffer();
        }
        throw new Error(response.status + " : " + response.url);
      };
    }
  } else {
  }
  var out = console.log.bind(console);
  var err = console.error.bind(console);
  var wasmBinary;
  var ABORT = false;
  var EXITSTATUS;
  var readyPromiseResolve, readyPromiseReject;
  var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
  var HEAP64, HEAPU64;
  var runtimeInitialized = false;
  function updateMemoryViews() {
    var b = wasmMemory.buffer;
    Module["HEAP8"] = HEAP8 = new Int8Array(b);
    Module["HEAP16"] = HEAP16 = new Int16Array(b);
    Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
    Module["HEAPU16"] = HEAPU16 = new Uint16Array(b);
    Module["HEAP32"] = HEAP32 = new Int32Array(b);
    Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
    HEAPF32 = new Float32Array(b);
    HEAPF64 = new Float64Array(b);
    HEAP64 = new BigInt64Array(b);
    HEAPU64 = new BigUint64Array(b);
  }
  function preRun() {
    if (Module["preRun"]) {
      if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
      while (Module["preRun"].length) {
        addOnPreRun(Module["preRun"].shift());
      }
    }
    callRuntimeCallbacks(onPreRuns);
  }
  function initRuntime() {
    runtimeInitialized = true;
    if (!Module["noFSInit"] && !FS.initialized) FS.init();
    TTY.init();
    wasmExports["o"]();
    FS.ignorePermissions = false;
  }
  function postRun() {
    if (Module["postRun"]) {
      if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
      while (Module["postRun"].length) {
        addOnPostRun(Module["postRun"].shift());
      }
    }
    callRuntimeCallbacks(onPostRuns);
  }
  function abort(what) {
    Module["onAbort"]?.(what);
    what = "Aborted(" + what + ")";
    err(what);
    ABORT = true;
    what += ". Build with -sASSERTIONS for more info.";
    var e = new WebAssembly.RuntimeError(what);
    readyPromiseReject?.(e);
    throw e;
  }
  var wasmBinaryFile;
  function findWasmBinary() {
    if (Module["locateFile"]) {
      return locateFile("libadlmidi.dosbox.slim.browser.wasm");
    }
    return new URL("libadlmidi.dosbox.slim.browser.wasm", import.meta.url).href;
  }
  function getBinarySync(file) {
    if (file == wasmBinaryFile && wasmBinary) {
      return new Uint8Array(wasmBinary);
    }
    if (readBinary) {
      return readBinary(file);
    }
    throw "both async and sync fetching of the wasm failed";
  }
  async function getWasmBinary(binaryFile) {
    if (!wasmBinary) {
      try {
        var response = await readAsync(binaryFile);
        return new Uint8Array(response);
      } catch {
      }
    }
    return getBinarySync(binaryFile);
  }
  async function instantiateArrayBuffer(binaryFile, imports) {
    try {
      var binary = await getWasmBinary(binaryFile);
      var instance = await WebAssembly.instantiate(binary, imports);
      return instance;
    } catch (reason) {
      err(`failed to asynchronously prepare wasm: ${reason}`);
      abort(reason);
    }
  }
  async function instantiateAsync(binary, binaryFile, imports) {
    if (!binary) {
      try {
        var response = fetch(binaryFile, { credentials: "same-origin" });
        var instantiationResult = await WebAssembly.instantiateStreaming(response, imports);
        return instantiationResult;
      } catch (reason) {
        err(`wasm streaming compile failed: ${reason}`);
        err("falling back to ArrayBuffer instantiation");
      }
    }
    return instantiateArrayBuffer(binaryFile, imports);
  }
  function getWasmImports() {
    var imports = { a: wasmImports };
    return imports;
  }
  async function createWasm() {
    function receiveInstance(instance, module) {
      wasmExports = instance.exports;
      assignWasmExports(wasmExports);
      updateMemoryViews();
      return wasmExports;
    }
    function receiveInstantiationResult(result2) {
      return receiveInstance(result2["instance"]);
    }
    var info = getWasmImports();
    if (Module["instantiateWasm"]) {
      return new Promise((resolve, reject) => {
        Module["instantiateWasm"](info, (inst, mod) => {
          resolve(receiveInstance(inst, mod));
        });
      });
    }
    wasmBinaryFile ?? (wasmBinaryFile = findWasmBinary());
    var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
    var exports = receiveInstantiationResult(result);
    return exports;
  }
  class ExitStatus {
    constructor(status) {
      __publicField(this, "name", "ExitStatus");
      this.message = `Program terminated with exit(${status})`;
      this.status = status;
    }
  }
  var callRuntimeCallbacks = (callbacks) => {
    while (callbacks.length > 0) {
      callbacks.shift()(Module);
    }
  };
  var onPostRuns = [];
  var addOnPostRun = (cb) => onPostRuns.push(cb);
  var onPreRuns = [];
  var addOnPreRun = (cb) => onPreRuns.push(cb);
  function getValue(ptr, type = "i8") {
    if (type.endsWith("*")) type = "*";
    switch (type) {
      case "i1":
        return HEAP8[ptr];
      case "i8":
        return HEAP8[ptr];
      case "i16":
        return HEAP16[ptr >> 1];
      case "i32":
        return HEAP32[ptr >> 2];
      case "i64":
        return HEAP64[ptr >> 3];
      case "float":
        return HEAPF32[ptr >> 2];
      case "double":
        return HEAPF64[ptr >> 3];
      case "*":
        return HEAPU32[ptr >> 2];
      default:
        abort(`invalid type for getValue: ${type}`);
    }
  }
  var noExitRuntime = true;
  function setValue(ptr, value, type = "i8") {
    if (type.endsWith("*")) type = "*";
    switch (type) {
      case "i1":
        HEAP8[ptr] = value;
        break;
      case "i8":
        HEAP8[ptr] = value;
        break;
      case "i16":
        HEAP16[ptr >> 1] = value;
        break;
      case "i32":
        HEAP32[ptr >> 2] = value;
        break;
      case "i64":
        HEAP64[ptr >> 3] = BigInt(value);
        break;
      case "float":
        HEAPF32[ptr >> 2] = value;
        break;
      case "double":
        HEAPF64[ptr >> 3] = value;
        break;
      case "*":
        HEAPU32[ptr >> 2] = value;
        break;
      default:
        abort(`invalid type for setValue: ${type}`);
    }
  }
  var stackRestore = (val) => __emscripten_stack_restore(val);
  var stackSave = () => _emscripten_stack_get_current();
  class ExceptionInfo {
    constructor(excPtr) {
      this.excPtr = excPtr;
      this.ptr = excPtr - 24;
    }
    set_type(type) {
      HEAPU32[this.ptr + 4 >> 2] = type;
    }
    get_type() {
      return HEAPU32[this.ptr + 4 >> 2];
    }
    set_destructor(destructor) {
      HEAPU32[this.ptr + 8 >> 2] = destructor;
    }
    get_destructor() {
      return HEAPU32[this.ptr + 8 >> 2];
    }
    set_caught(caught) {
      caught = caught ? 1 : 0;
      HEAP8[this.ptr + 12] = caught;
    }
    get_caught() {
      return HEAP8[this.ptr + 12] != 0;
    }
    set_rethrown(rethrown) {
      rethrown = rethrown ? 1 : 0;
      HEAP8[this.ptr + 13] = rethrown;
    }
    get_rethrown() {
      return HEAP8[this.ptr + 13] != 0;
    }
    init(type, destructor) {
      this.set_adjusted_ptr(0);
      this.set_type(type);
      this.set_destructor(destructor);
    }
    set_adjusted_ptr(adjustedPtr) {
      HEAPU32[this.ptr + 16 >> 2] = adjustedPtr;
    }
    get_adjusted_ptr() {
      return HEAPU32[this.ptr + 16 >> 2];
    }
  }
  var exceptionLast = 0;
  var uncaughtExceptionCount = 0;
  var ___cxa_throw = (ptr, type, destructor) => {
    var info = new ExceptionInfo(ptr);
    info.init(type, destructor);
    exceptionLast = ptr;
    uncaughtExceptionCount++;
    throw exceptionLast;
  };
  var syscallGetVarargI = () => {
    var ret = HEAP32[+SYSCALLS.varargs >> 2];
    SYSCALLS.varargs += 4;
    return ret;
  };
  var syscallGetVarargP = syscallGetVarargI;
  var PATH = { isAbs: (path) => path.charAt(0) === "/", splitPath: (filename) => {
    var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
    return splitPathRe.exec(filename).slice(1);
  }, normalizeArray: (parts, allowAboveRoot) => {
    var up = 0;
    for (var i = parts.length - 1; i >= 0; i--) {
      var last = parts[i];
      if (last === ".") {
        parts.splice(i, 1);
      } else if (last === "..") {
        parts.splice(i, 1);
        up++;
      } else if (up) {
        parts.splice(i, 1);
        up--;
      }
    }
    if (allowAboveRoot) {
      for (; up; up--) {
        parts.unshift("..");
      }
    }
    return parts;
  }, normalize: (path) => {
    var isAbsolute = PATH.isAbs(path), trailingSlash = path.slice(-1) === "/";
    path = PATH.normalizeArray(path.split("/").filter((p) => !!p), !isAbsolute).join("/");
    if (!path && !isAbsolute) {
      path = ".";
    }
    if (path && trailingSlash) {
      path += "/";
    }
    return (isAbsolute ? "/" : "") + path;
  }, dirname: (path) => {
    var result = PATH.splitPath(path), root = result[0], dir = result[1];
    if (!root && !dir) {
      return ".";
    }
    if (dir) {
      dir = dir.slice(0, -1);
    }
    return root + dir;
  }, basename: (path) => path && path.match(/([^\/]+|\/)\/*$/)[1], join: (...paths) => PATH.normalize(paths.join("/")), join2: (l, r) => PATH.normalize(l + "/" + r) };
  var initRandomFill = () => (view) => crypto.getRandomValues(view);
  var randomFill = (view) => {
    (randomFill = initRandomFill())(view);
  };
  var PATH_FS = { resolve: (...args) => {
    var resolvedPath = "", resolvedAbsolute = false;
    for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
      var path = i >= 0 ? args[i] : FS.cwd();
      if (typeof path != "string") {
        throw new TypeError("Arguments to path.resolve must be strings");
      } else if (!path) {
        return "";
      }
      resolvedPath = path + "/" + resolvedPath;
      resolvedAbsolute = PATH.isAbs(path);
    }
    resolvedPath = PATH.normalizeArray(resolvedPath.split("/").filter((p) => !!p), !resolvedAbsolute).join("/");
    return (resolvedAbsolute ? "/" : "") + resolvedPath || ".";
  }, relative: (from, to) => {
    from = PATH_FS.resolve(from).slice(1);
    to = PATH_FS.resolve(to).slice(1);
    function trim(arr) {
      var start = 0;
      for (; start < arr.length; start++) {
        if (arr[start] !== "") break;
      }
      var end = arr.length - 1;
      for (; end >= 0; end--) {
        if (arr[end] !== "") break;
      }
      if (start > end) return [];
      return arr.slice(start, end - start + 1);
    }
    var fromParts = trim(from.split("/"));
    var toParts = trim(to.split("/"));
    var length = Math.min(fromParts.length, toParts.length);
    var samePartsLength = length;
    for (var i = 0; i < length; i++) {
      if (fromParts[i] !== toParts[i]) {
        samePartsLength = i;
        break;
      }
    }
    var outputParts = [];
    for (var i = samePartsLength; i < fromParts.length; i++) {
      outputParts.push("..");
    }
    outputParts = outputParts.concat(toParts.slice(samePartsLength));
    return outputParts.join("/");
  } };
  var UTF8Decoder = globalThis.TextDecoder && new TextDecoder();
  var findStringEnd = (heapOrArray, idx, maxBytesToRead, ignoreNul) => {
    var maxIdx = idx + maxBytesToRead;
    if (ignoreNul) return maxIdx;
    while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;
    return idx;
  };
  var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {
    var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);
    if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
      return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
    }
    var str = "";
    while (idx < endPtr) {
      var u0 = heapOrArray[idx++];
      if (!(u0 & 128)) {
        str += String.fromCharCode(u0);
        continue;
      }
      var u1 = heapOrArray[idx++] & 63;
      if ((u0 & 224) == 192) {
        str += String.fromCharCode((u0 & 31) << 6 | u1);
        continue;
      }
      var u2 = heapOrArray[idx++] & 63;
      if ((u0 & 240) == 224) {
        u0 = (u0 & 15) << 12 | u1 << 6 | u2;
      } else {
        u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
      }
      if (u0 < 65536) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 65536;
        str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
      }
    }
    return str;
  };
  var FS_stdin_getChar_buffer = [];
  var lengthBytesUTF8 = (str) => {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
      var c = str.charCodeAt(i);
      if (c <= 127) {
        len++;
      } else if (c <= 2047) {
        len += 2;
      } else if (c >= 55296 && c <= 57343) {
        len += 4;
        ++i;
      } else {
        len += 3;
      }
    }
    return len;
  };
  var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
    if (!(maxBytesToWrite > 0)) return 0;
    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1;
    for (var i = 0; i < str.length; ++i) {
      var u = str.codePointAt(i);
      if (u <= 127) {
        if (outIdx >= endIdx) break;
        heap[outIdx++] = u;
      } else if (u <= 2047) {
        if (outIdx + 1 >= endIdx) break;
        heap[outIdx++] = 192 | u >> 6;
        heap[outIdx++] = 128 | u & 63;
      } else if (u <= 65535) {
        if (outIdx + 2 >= endIdx) break;
        heap[outIdx++] = 224 | u >> 12;
        heap[outIdx++] = 128 | u >> 6 & 63;
        heap[outIdx++] = 128 | u & 63;
      } else {
        if (outIdx + 3 >= endIdx) break;
        heap[outIdx++] = 240 | u >> 18;
        heap[outIdx++] = 128 | u >> 12 & 63;
        heap[outIdx++] = 128 | u >> 6 & 63;
        heap[outIdx++] = 128 | u & 63;
        i++;
      }
    }
    heap[outIdx] = 0;
    return outIdx - startIdx;
  };
  var intArrayFromString = (stringy, dontAddNull, length) => {
    var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
    var u8array = new Array(len);
    var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
    if (dontAddNull) u8array.length = numBytesWritten;
    return u8array;
  };
  var FS_stdin_getChar = () => {
    if (!FS_stdin_getChar_buffer.length) {
      var result = null;
      if (globalThis.window?.prompt) {
        result = window.prompt("Input: ");
        if (result !== null) {
          result += "\n";
        }
      } else {
      }
      if (!result) {
        return null;
      }
      FS_stdin_getChar_buffer = intArrayFromString(result, true);
    }
    return FS_stdin_getChar_buffer.shift();
  };
  var TTY = { ttys: [], init() {
  }, shutdown() {
  }, register(dev, ops) {
    TTY.ttys[dev] = { input: [], output: [], ops };
    FS.registerDevice(dev, TTY.stream_ops);
  }, stream_ops: { open(stream) {
    var tty = TTY.ttys[stream.node.rdev];
    if (!tty) {
      throw new FS.ErrnoError(43);
    }
    stream.tty = tty;
    stream.seekable = false;
  }, close(stream) {
    stream.tty.ops.fsync(stream.tty);
  }, fsync(stream) {
    stream.tty.ops.fsync(stream.tty);
  }, read(stream, buffer, offset, length, pos) {
    if (!stream.tty || !stream.tty.ops.get_char) {
      throw new FS.ErrnoError(60);
    }
    var bytesRead = 0;
    for (var i = 0; i < length; i++) {
      var result;
      try {
        result = stream.tty.ops.get_char(stream.tty);
      } catch (e) {
        throw new FS.ErrnoError(29);
      }
      if (result === void 0 && bytesRead === 0) {
        throw new FS.ErrnoError(6);
      }
      if (result === null || result === void 0) break;
      bytesRead++;
      buffer[offset + i] = result;
    }
    if (bytesRead) {
      stream.node.atime = Date.now();
    }
    return bytesRead;
  }, write(stream, buffer, offset, length, pos) {
    if (!stream.tty || !stream.tty.ops.put_char) {
      throw new FS.ErrnoError(60);
    }
    try {
      for (var i = 0; i < length; i++) {
        stream.tty.ops.put_char(stream.tty, buffer[offset + i]);
      }
    } catch (e) {
      throw new FS.ErrnoError(29);
    }
    if (length) {
      stream.node.mtime = stream.node.ctime = Date.now();
    }
    return i;
  } }, default_tty_ops: { get_char(tty) {
    return FS_stdin_getChar();
  }, put_char(tty, val) {
    if (val === null || val === 10) {
      out(UTF8ArrayToString(tty.output));
      tty.output = [];
    } else {
      if (val != 0) tty.output.push(val);
    }
  }, fsync(tty) {
    if (tty.output?.length > 0) {
      out(UTF8ArrayToString(tty.output));
      tty.output = [];
    }
  }, ioctl_tcgets(tty) {
    return { c_iflag: 25856, c_oflag: 5, c_cflag: 191, c_lflag: 35387, c_cc: [3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
  }, ioctl_tcsets(tty, optional_actions, data) {
    return 0;
  }, ioctl_tiocgwinsz(tty) {
    return [24, 80];
  } }, default_tty1_ops: { put_char(tty, val) {
    if (val === null || val === 10) {
      err(UTF8ArrayToString(tty.output));
      tty.output = [];
    } else {
      if (val != 0) tty.output.push(val);
    }
  }, fsync(tty) {
    if (tty.output?.length > 0) {
      err(UTF8ArrayToString(tty.output));
      tty.output = [];
    }
  } } };
  var mmapAlloc = (size) => {
    abort();
  };
  var MEMFS = { ops_table: null, mount(mount) {
    return MEMFS.createNode(null, "/", 16895, 0);
  }, createNode(parent, name, mode, dev) {
    if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
      throw new FS.ErrnoError(63);
    }
    MEMFS.ops_table || (MEMFS.ops_table = { dir: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr, lookup: MEMFS.node_ops.lookup, mknod: MEMFS.node_ops.mknod, rename: MEMFS.node_ops.rename, unlink: MEMFS.node_ops.unlink, rmdir: MEMFS.node_ops.rmdir, readdir: MEMFS.node_ops.readdir, symlink: MEMFS.node_ops.symlink }, stream: { llseek: MEMFS.stream_ops.llseek } }, file: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr }, stream: { llseek: MEMFS.stream_ops.llseek, read: MEMFS.stream_ops.read, write: MEMFS.stream_ops.write, mmap: MEMFS.stream_ops.mmap, msync: MEMFS.stream_ops.msync } }, link: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr, readlink: MEMFS.node_ops.readlink }, stream: {} }, chrdev: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr }, stream: FS.chrdev_stream_ops } });
    var node = FS.createNode(parent, name, mode, dev);
    if (FS.isDir(node.mode)) {
      node.node_ops = MEMFS.ops_table.dir.node;
      node.stream_ops = MEMFS.ops_table.dir.stream;
      node.contents = {};
    } else if (FS.isFile(node.mode)) {
      node.node_ops = MEMFS.ops_table.file.node;
      node.stream_ops = MEMFS.ops_table.file.stream;
      node.usedBytes = 0;
      node.contents = null;
    } else if (FS.isLink(node.mode)) {
      node.node_ops = MEMFS.ops_table.link.node;
      node.stream_ops = MEMFS.ops_table.link.stream;
    } else if (FS.isChrdev(node.mode)) {
      node.node_ops = MEMFS.ops_table.chrdev.node;
      node.stream_ops = MEMFS.ops_table.chrdev.stream;
    }
    node.atime = node.mtime = node.ctime = Date.now();
    if (parent) {
      parent.contents[name] = node;
      parent.atime = parent.mtime = parent.ctime = node.atime;
    }
    return node;
  }, getFileDataAsTypedArray(node) {
    if (!node.contents) return new Uint8Array(0);
    if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes);
    return new Uint8Array(node.contents);
  }, expandFileStorage(node, newCapacity) {
    var prevCapacity = node.contents ? node.contents.length : 0;
    if (prevCapacity >= newCapacity) return;
    var CAPACITY_DOUBLING_MAX = 1024 * 1024;
    newCapacity = Math.max(newCapacity, prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125) >>> 0);
    if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);
    var oldContents = node.contents;
    node.contents = new Uint8Array(newCapacity);
    if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0);
  }, resizeFileStorage(node, newSize) {
    if (node.usedBytes == newSize) return;
    if (newSize == 0) {
      node.contents = null;
      node.usedBytes = 0;
    } else {
      var oldContents = node.contents;
      node.contents = new Uint8Array(newSize);
      if (oldContents) {
        node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes)));
      }
      node.usedBytes = newSize;
    }
  }, node_ops: { getattr(node) {
    var attr = {};
    attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
    attr.ino = node.id;
    attr.mode = node.mode;
    attr.nlink = 1;
    attr.uid = 0;
    attr.gid = 0;
    attr.rdev = node.rdev;
    if (FS.isDir(node.mode)) {
      attr.size = 4096;
    } else if (FS.isFile(node.mode)) {
      attr.size = node.usedBytes;
    } else if (FS.isLink(node.mode)) {
      attr.size = node.link.length;
    } else {
      attr.size = 0;
    }
    attr.atime = new Date(node.atime);
    attr.mtime = new Date(node.mtime);
    attr.ctime = new Date(node.ctime);
    attr.blksize = 4096;
    attr.blocks = Math.ceil(attr.size / attr.blksize);
    return attr;
  }, setattr(node, attr) {
    for (const key of ["mode", "atime", "mtime", "ctime"]) {
      if (attr[key] != null) {
        node[key] = attr[key];
      }
    }
    if (attr.size !== void 0) {
      MEMFS.resizeFileStorage(node, attr.size);
    }
  }, lookup(parent, name) {
    if (!MEMFS.doesNotExistError) {
      MEMFS.doesNotExistError = new FS.ErrnoError(44);
      MEMFS.doesNotExistError.stack = "<generic error, no stack>";
    }
    throw MEMFS.doesNotExistError;
  }, mknod(parent, name, mode, dev) {
    return MEMFS.createNode(parent, name, mode, dev);
  }, rename(old_node, new_dir, new_name) {
    var new_node;
    try {
      new_node = FS.lookupNode(new_dir, new_name);
    } catch (e) {
    }
    if (new_node) {
      if (FS.isDir(old_node.mode)) {
        for (var i in new_node.contents) {
          throw new FS.ErrnoError(55);
        }
      }
      FS.hashRemoveNode(new_node);
    }
    delete old_node.parent.contents[old_node.name];
    new_dir.contents[new_name] = old_node;
    old_node.name = new_name;
    new_dir.ctime = new_dir.mtime = old_node.parent.ctime = old_node.parent.mtime = Date.now();
  }, unlink(parent, name) {
    delete parent.contents[name];
    parent.ctime = parent.mtime = Date.now();
  }, rmdir(parent, name) {
    var node = FS.lookupNode(parent, name);
    for (var i in node.contents) {
      throw new FS.ErrnoError(55);
    }
    delete parent.contents[name];
    parent.ctime = parent.mtime = Date.now();
  }, readdir(node) {
    return [".", "..", ...Object.keys(node.contents)];
  }, symlink(parent, newname, oldpath) {
    var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
    node.link = oldpath;
    return node;
  }, readlink(node) {
    if (!FS.isLink(node.mode)) {
      throw new FS.ErrnoError(28);
    }
    return node.link;
  } }, stream_ops: { read(stream, buffer, offset, length, position) {
    var contents = stream.node.contents;
    if (position >= stream.node.usedBytes) return 0;
    var size = Math.min(stream.node.usedBytes - position, length);
    if (size > 8 && contents.subarray) {
      buffer.set(contents.subarray(position, position + size), offset);
    } else {
      for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
    }
    return size;
  }, write(stream, buffer, offset, length, position, canOwn) {
    if (buffer.buffer === HEAP8.buffer) {
      canOwn = false;
    }
    if (!length) return 0;
    var node = stream.node;
    node.mtime = node.ctime = Date.now();
    if (buffer.subarray && (!node.contents || node.contents.subarray)) {
      if (canOwn) {
        node.contents = buffer.subarray(offset, offset + length);
        node.usedBytes = length;
        return length;
      } else if (node.usedBytes === 0 && position === 0) {
        node.contents = buffer.slice(offset, offset + length);
        node.usedBytes = length;
        return length;
      } else if (position + length <= node.usedBytes) {
        node.contents.set(buffer.subarray(offset, offset + length), position);
        return length;
      }
    }
    MEMFS.expandFileStorage(node, position + length);
    if (node.contents.subarray && buffer.subarray) {
      node.contents.set(buffer.subarray(offset, offset + length), position);
    } else {
      for (var i = 0; i < length; i++) {
        node.contents[position + i] = buffer[offset + i];
      }
    }
    node.usedBytes = Math.max(node.usedBytes, position + length);
    return length;
  }, llseek(stream, offset, whence) {
    var position = offset;
    if (whence === 1) {
      position += stream.position;
    } else if (whence === 2) {
      if (FS.isFile(stream.node.mode)) {
        position += stream.node.usedBytes;
      }
    }
    if (position < 0) {
      throw new FS.ErrnoError(28);
    }
    return position;
  }, mmap(stream, length, position, prot, flags) {
    if (!FS.isFile(stream.node.mode)) {
      throw new FS.ErrnoError(43);
    }
    var ptr;
    var allocated;
    var contents = stream.node.contents;
    if (!(flags & 2) && contents && contents.buffer === HEAP8.buffer) {
      allocated = false;
      ptr = contents.byteOffset;
    } else {
      allocated = true;
      ptr = mmapAlloc(length);
      if (!ptr) {
        throw new FS.ErrnoError(48);
      }
      if (contents) {
        if (position > 0 || position + length < contents.length) {
          if (contents.subarray) {
            contents = contents.subarray(position, position + length);
          } else {
            contents = Array.prototype.slice.call(contents, position, position + length);
          }
        }
        HEAP8.set(contents, ptr);
      }
    }
    return { ptr, allocated };
  }, msync(stream, buffer, offset, length, mmapFlags) {
    MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
    return 0;
  } } };
  var FS_modeStringToFlags = (str) => {
    var flagModes = { r: 0, "r+": 2, w: 512 | 64 | 1, "w+": 512 | 64 | 2, a: 1024 | 64 | 1, "a+": 1024 | 64 | 2 };
    var flags = flagModes[str];
    if (typeof flags == "undefined") {
      throw new Error(`Unknown file open mode: ${str}`);
    }
    return flags;
  };
  var FS_getMode = (canRead, canWrite) => {
    var mode = 0;
    if (canRead) mode |= 292 | 73;
    if (canWrite) mode |= 146;
    return mode;
  };
  var asyncLoad = async (url) => {
    var arrayBuffer = await readAsync(url);
    return new Uint8Array(arrayBuffer);
  };
  var FS_createDataFile = (...args) => FS.createDataFile(...args);
  var getUniqueRunDependency = (id) => id;
  var runDependencies = 0;
  var dependenciesFulfilled = null;
  var removeRunDependency = (id) => {
    runDependencies--;
    Module["monitorRunDependencies"]?.(runDependencies);
    if (runDependencies == 0) {
      if (dependenciesFulfilled) {
        var callback = dependenciesFulfilled;
        dependenciesFulfilled = null;
        callback();
      }
    }
  };
  var addRunDependency = (id) => {
    runDependencies++;
    Module["monitorRunDependencies"]?.(runDependencies);
  };
  var preloadPlugins = [];
  var FS_handledByPreloadPlugin = async (byteArray, fullname) => {
    if (typeof Browser != "undefined") Browser.init();
    for (var plugin of preloadPlugins) {
      if (plugin["canHandle"](fullname)) {
        return plugin["handle"](byteArray, fullname);
      }
    }
    return byteArray;
  };
  var FS_preloadFile = async (parent, name, url, canRead, canWrite, dontCreateFile, canOwn, preFinish) => {
    var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
    var dep = getUniqueRunDependency(`cp ${fullname}`);
    addRunDependency(dep);
    try {
      var byteArray = url;
      if (typeof url == "string") {
        byteArray = await asyncLoad(url);
      }
      byteArray = await FS_handledByPreloadPlugin(byteArray, fullname);
      preFinish?.();
      if (!dontCreateFile) {
        FS_createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
      }
    } finally {
      removeRunDependency(dep);
    }
  };
  var FS_createPreloadedFile = (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) => {
    FS_preloadFile(parent, name, url, canRead, canWrite, dontCreateFile, canOwn, preFinish).then(onload).catch(onerror);
  };
  var FS = { root: null, mounts: [], devices: {}, streams: [], nextInode: 1, nameTable: null, currentPath: "/", initialized: false, ignorePermissions: true, filesystems: null, syncFSRequests: 0, readFiles: {}, ErrnoError: class {
    constructor(errno) {
      __publicField(this, "name", "ErrnoError");
      this.errno = errno;
    }
  }, FSStream: class {
    constructor() {
      __publicField(this, "shared", {});
    }
    get object() {
      return this.node;
    }
    set object(val) {
      this.node = val;
    }
    get isRead() {
      return (this.flags & 2097155) !== 1;
    }
    get isWrite() {
      return (this.flags & 2097155) !== 0;
    }
    get isAppend() {
      return this.flags & 1024;
    }
    get flags() {
      return this.shared.flags;
    }
    set flags(val) {
      this.shared.flags = val;
    }
    get position() {
      return this.shared.position;
    }
    set position(val) {
      this.shared.position = val;
    }
  }, FSNode: class {
    constructor(parent, name, mode, rdev) {
      __publicField(this, "node_ops", {});
      __publicField(this, "stream_ops", {});
      __publicField(this, "readMode", 292 | 73);
      __publicField(this, "writeMode", 146);
      __publicField(this, "mounted", null);
      if (!parent) {
        parent = this;
      }
      this.parent = parent;
      this.mount = parent.mount;
      this.id = FS.nextInode++;
      this.name = name;
      this.mode = mode;
      this.rdev = rdev;
      this.atime = this.mtime = this.ctime = Date.now();
    }
    get read() {
      return (this.mode & this.readMode) === this.readMode;
    }
    set read(val) {
      val ? this.mode |= this.readMode : this.mode &= ~this.readMode;
    }
    get write() {
      return (this.mode & this.writeMode) === this.writeMode;
    }
    set write(val) {
      val ? this.mode |= this.writeMode : this.mode &= ~this.writeMode;
    }
    get isFolder() {
      return FS.isDir(this.mode);
    }
    get isDevice() {
      return FS.isChrdev(this.mode);
    }
  }, lookupPath(path, opts = {}) {
    if (!path) {
      throw new FS.ErrnoError(44);
    }
    opts.follow_mount ?? (opts.follow_mount = true);
    if (!PATH.isAbs(path)) {
      path = FS.cwd() + "/" + path;
    }
    linkloop: for (var nlinks = 0; nlinks < 40; nlinks++) {
      var parts = path.split("/").filter((p) => !!p);
      var current = FS.root;
      var current_path = "/";
      for (var i = 0; i < parts.length; i++) {
        var islast = i === parts.length - 1;
        if (islast && opts.parent) {
          break;
        }
        if (parts[i] === ".") {
          continue;
        }
        if (parts[i] === "..") {
          current_path = PATH.dirname(current_path);
          if (FS.isRoot(current)) {
            path = current_path + "/" + parts.slice(i + 1).join("/");
            nlinks--;
            continue linkloop;
          } else {
            current = current.parent;
          }
          continue;
        }
        current_path = PATH.join2(current_path, parts[i]);
        try {
          current = FS.lookupNode(current, parts[i]);
        } catch (e) {
          if (e?.errno === 44 && islast && opts.noent_okay) {
            return { path: current_path };
          }
          throw e;
        }
        if (FS.isMountpoint(current) && (!islast || opts.follow_mount)) {
          current = current.mounted.root;
        }
        if (FS.isLink(current.mode) && (!islast || opts.follow)) {
          if (!current.node_ops.readlink) {
            throw new FS.ErrnoError(52);
          }
          var link = current.node_ops.readlink(current);
          if (!PATH.isAbs(link)) {
            link = PATH.dirname(current_path) + "/" + link;
          }
          path = link + "/" + parts.slice(i + 1).join("/");
          continue linkloop;
        }
      }
      return { path: current_path, node: current };
    }
    throw new FS.ErrnoError(32);
  }, getPath(node) {
    var path;
    while (true) {
      if (FS.isRoot(node)) {
        var mount = node.mount.mountpoint;
        if (!path) return mount;
        return mount[mount.length - 1] !== "/" ? `${mount}/${path}` : mount + path;
      }
      path = path ? `${node.name}/${path}` : node.name;
      node = node.parent;
    }
  }, hashName(parentid, name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
      hash = (hash << 5) - hash + name.charCodeAt(i) | 0;
    }
    return (parentid + hash >>> 0) % FS.nameTable.length;
  }, hashAddNode(node) {
    var hash = FS.hashName(node.parent.id, node.name);
    node.name_next = FS.nameTable[hash];
    FS.nameTable[hash] = node;
  }, hashRemoveNode(node) {
    var hash = FS.hashName(node.parent.id, node.name);
    if (FS.nameTable[hash] === node) {
      FS.nameTable[hash] = node.name_next;
    } else {
      var current = FS.nameTable[hash];
      while (current) {
        if (current.name_next === node) {
          current.name_next = node.name_next;
          break;
        }
        current = current.name_next;
      }
    }
  }, lookupNode(parent, name) {
    var errCode = FS.mayLookup(parent);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    var hash = FS.hashName(parent.id, name);
    for (var node = FS.nameTable[hash]; node; node = node.name_next) {
      var nodeName = node.name;
      if (node.parent.id === parent.id && nodeName === name) {
        return node;
      }
    }
    return FS.lookup(parent, name);
  }, createNode(parent, name, mode, rdev) {
    var node = new FS.FSNode(parent, name, mode, rdev);
    FS.hashAddNode(node);
    return node;
  }, destroyNode(node) {
    FS.hashRemoveNode(node);
  }, isRoot(node) {
    return node === node.parent;
  }, isMountpoint(node) {
    return !!node.mounted;
  }, isFile(mode) {
    return (mode & 61440) === 32768;
  }, isDir(mode) {
    return (mode & 61440) === 16384;
  }, isLink(mode) {
    return (mode & 61440) === 40960;
  }, isChrdev(mode) {
    return (mode & 61440) === 8192;
  }, isBlkdev(mode) {
    return (mode & 61440) === 24576;
  }, isFIFO(mode) {
    return (mode & 61440) === 4096;
  }, isSocket(mode) {
    return (mode & 49152) === 49152;
  }, flagsToPermissionString(flag) {
    var perms = ["r", "w", "rw"][flag & 3];
    if (flag & 512) {
      perms += "w";
    }
    return perms;
  }, nodePermissions(node, perms) {
    if (FS.ignorePermissions) {
      return 0;
    }
    if (perms.includes("r") && !(node.mode & 292)) {
      return 2;
    } else if (perms.includes("w") && !(node.mode & 146)) {
      return 2;
    } else if (perms.includes("x") && !(node.mode & 73)) {
      return 2;
    }
    return 0;
  }, mayLookup(dir) {
    if (!FS.isDir(dir.mode)) return 54;
    var errCode = FS.nodePermissions(dir, "x");
    if (errCode) return errCode;
    if (!dir.node_ops.lookup) return 2;
    return 0;
  }, mayCreate(dir, name) {
    if (!FS.isDir(dir.mode)) {
      return 54;
    }
    try {
      var node = FS.lookupNode(dir, name);
      return 20;
    } catch (e) {
    }
    return FS.nodePermissions(dir, "wx");
  }, mayDelete(dir, name, isdir) {
    var node;
    try {
      node = FS.lookupNode(dir, name);
    } catch (e) {
      return e.errno;
    }
    var errCode = FS.nodePermissions(dir, "wx");
    if (errCode) {
      return errCode;
    }
    if (isdir) {
      if (!FS.isDir(node.mode)) {
        return 54;
      }
      if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
        return 10;
      }
    } else {
      if (FS.isDir(node.mode)) {
        return 31;
      }
    }
    return 0;
  }, mayOpen(node, flags) {
    if (!node) {
      return 44;
    }
    if (FS.isLink(node.mode)) {
      return 32;
    } else if (FS.isDir(node.mode)) {
      if (FS.flagsToPermissionString(flags) !== "r" || flags & (512 | 64)) {
        return 31;
      }
    }
    return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
  }, checkOpExists(op, err2) {
    if (!op) {
      throw new FS.ErrnoError(err2);
    }
    return op;
  }, MAX_OPEN_FDS: 4096, nextfd() {
    for (var fd = 0; fd <= FS.MAX_OPEN_FDS; fd++) {
      if (!FS.streams[fd]) {
        return fd;
      }
    }
    throw new FS.ErrnoError(33);
  }, getStreamChecked(fd) {
    var stream = FS.getStream(fd);
    if (!stream) {
      throw new FS.ErrnoError(8);
    }
    return stream;
  }, getStream: (fd) => FS.streams[fd], createStream(stream, fd = -1) {
    stream = Object.assign(new FS.FSStream(), stream);
    if (fd == -1) {
      fd = FS.nextfd();
    }
    stream.fd = fd;
    FS.streams[fd] = stream;
    return stream;
  }, closeStream(fd) {
    FS.streams[fd] = null;
  }, dupStream(origStream, fd = -1) {
    var stream = FS.createStream(origStream, fd);
    stream.stream_ops?.dup?.(stream);
    return stream;
  }, doSetAttr(stream, node, attr) {
    var setattr = stream?.stream_ops.setattr;
    var arg = setattr ? stream : node;
    setattr ?? (setattr = node.node_ops.setattr);
    FS.checkOpExists(setattr, 63);
    setattr(arg, attr);
  }, chrdev_stream_ops: { open(stream) {
    var device = FS.getDevice(stream.node.rdev);
    stream.stream_ops = device.stream_ops;
    stream.stream_ops.open?.(stream);
  }, llseek() {
    throw new FS.ErrnoError(70);
  } }, major: (dev) => dev >> 8, minor: (dev) => dev & 255, makedev: (ma, mi) => ma << 8 | mi, registerDevice(dev, ops) {
    FS.devices[dev] = { stream_ops: ops };
  }, getDevice: (dev) => FS.devices[dev], getMounts(mount) {
    var mounts = [];
    var check = [mount];
    while (check.length) {
      var m = check.pop();
      mounts.push(m);
      check.push(...m.mounts);
    }
    return mounts;
  }, syncfs(populate, callback) {
    if (typeof populate == "function") {
      callback = populate;
      populate = false;
    }
    FS.syncFSRequests++;
    if (FS.syncFSRequests > 1) {
      err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`);
    }
    var mounts = FS.getMounts(FS.root.mount);
    var completed = 0;
    function doCallback(errCode) {
      FS.syncFSRequests--;
      return callback(errCode);
    }
    function done(errCode) {
      if (errCode) {
        if (!done.errored) {
          done.errored = true;
          return doCallback(errCode);
        }
        return;
      }
      if (++completed >= mounts.length) {
        doCallback(null);
      }
    }
    for (var mount of mounts) {
      if (mount.type.syncfs) {
        mount.type.syncfs(mount, populate, done);
      } else {
        done(null);
      }
    }
  }, mount(type, opts, mountpoint) {
    var root = mountpoint === "/";
    var pseudo = !mountpoint;
    var node;
    if (root && FS.root) {
      throw new FS.ErrnoError(10);
    } else if (!root && !pseudo) {
      var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
      mountpoint = lookup.path;
      node = lookup.node;
      if (FS.isMountpoint(node)) {
        throw new FS.ErrnoError(10);
      }
      if (!FS.isDir(node.mode)) {
        throw new FS.ErrnoError(54);
      }
    }
    var mount = { type, opts, mountpoint, mounts: [] };
    var mountRoot = type.mount(mount);
    mountRoot.mount = mount;
    mount.root = mountRoot;
    if (root) {
      FS.root = mountRoot;
    } else if (node) {
      node.mounted = mount;
      if (node.mount) {
        node.mount.mounts.push(mount);
      }
    }
    return mountRoot;
  }, unmount(mountpoint) {
    var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
    if (!FS.isMountpoint(lookup.node)) {
      throw new FS.ErrnoError(28);
    }
    var node = lookup.node;
    var mount = node.mounted;
    var mounts = FS.getMounts(mount);
    for (var [hash, current] of Object.entries(FS.nameTable)) {
      while (current) {
        var next = current.name_next;
        if (mounts.includes(current.mount)) {
          FS.destroyNode(current);
        }
        current = next;
      }
    }
    node.mounted = null;
    var idx = node.mount.mounts.indexOf(mount);
    node.mount.mounts.splice(idx, 1);
  }, lookup(parent, name) {
    return parent.node_ops.lookup(parent, name);
  }, mknod(path, mode, dev) {
    var lookup = FS.lookupPath(path, { parent: true });
    var parent = lookup.node;
    var name = PATH.basename(path);
    if (!name) {
      throw new FS.ErrnoError(28);
    }
    if (name === "." || name === "..") {
      throw new FS.ErrnoError(20);
    }
    var errCode = FS.mayCreate(parent, name);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.mknod) {
      throw new FS.ErrnoError(63);
    }
    return parent.node_ops.mknod(parent, name, mode, dev);
  }, statfs(path) {
    return FS.statfsNode(FS.lookupPath(path, { follow: true }).node);
  }, statfsStream(stream) {
    return FS.statfsNode(stream.node);
  }, statfsNode(node) {
    var rtn = { bsize: 4096, frsize: 4096, blocks: 1e6, bfree: 5e5, bavail: 5e5, files: FS.nextInode, ffree: FS.nextInode - 1, fsid: 42, flags: 2, namelen: 255 };
    if (node.node_ops.statfs) {
      Object.assign(rtn, node.node_ops.statfs(node.mount.opts.root));
    }
    return rtn;
  }, create(path, mode = 438) {
    mode &= 4095;
    mode |= 32768;
    return FS.mknod(path, mode, 0);
  }, mkdir(path, mode = 511) {
    mode &= 511 | 512;
    mode |= 16384;
    return FS.mknod(path, mode, 0);
  }, mkdirTree(path, mode) {
    var dirs = path.split("/");
    var d = "";
    for (var dir of dirs) {
      if (!dir) continue;
      if (d || PATH.isAbs(path)) d += "/";
      d += dir;
      try {
        FS.mkdir(d, mode);
      } catch (e) {
        if (e.errno != 20) throw e;
      }
    }
  }, mkdev(path, mode, dev) {
    if (typeof dev == "undefined") {
      dev = mode;
      mode = 438;
    }
    mode |= 8192;
    return FS.mknod(path, mode, dev);
  }, symlink(oldpath, newpath) {
    if (!PATH_FS.resolve(oldpath)) {
      throw new FS.ErrnoError(44);
    }
    var lookup = FS.lookupPath(newpath, { parent: true });
    var parent = lookup.node;
    if (!parent) {
      throw new FS.ErrnoError(44);
    }
    var newname = PATH.basename(newpath);
    var errCode = FS.mayCreate(parent, newname);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.symlink) {
      throw new FS.ErrnoError(63);
    }
    return parent.node_ops.symlink(parent, newname, oldpath);
  }, rename(old_path, new_path) {
    var old_dirname = PATH.dirname(old_path);
    var new_dirname = PATH.dirname(new_path);
    var old_name = PATH.basename(old_path);
    var new_name = PATH.basename(new_path);
    var lookup, old_dir, new_dir;
    lookup = FS.lookupPath(old_path, { parent: true });
    old_dir = lookup.node;
    lookup = FS.lookupPath(new_path, { parent: true });
    new_dir = lookup.node;
    if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
    if (old_dir.mount !== new_dir.mount) {
      throw new FS.ErrnoError(75);
    }
    var old_node = FS.lookupNode(old_dir, old_name);
    var relative = PATH_FS.relative(old_path, new_dirname);
    if (relative.charAt(0) !== ".") {
      throw new FS.ErrnoError(28);
    }
    relative = PATH_FS.relative(new_path, old_dirname);
    if (relative.charAt(0) !== ".") {
      throw new FS.ErrnoError(55);
    }
    var new_node;
    try {
      new_node = FS.lookupNode(new_dir, new_name);
    } catch (e) {
    }
    if (old_node === new_node) {
      return;
    }
    var isdir = FS.isDir(old_node.mode);
    var errCode = FS.mayDelete(old_dir, old_name, isdir);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    errCode = new_node ? FS.mayDelete(new_dir, new_name, isdir) : FS.mayCreate(new_dir, new_name);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!old_dir.node_ops.rename) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isMountpoint(old_node) || new_node && FS.isMountpoint(new_node)) {
      throw new FS.ErrnoError(10);
    }
    if (new_dir !== old_dir) {
      errCode = FS.nodePermissions(old_dir, "w");
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
    }
    FS.hashRemoveNode(old_node);
    try {
      old_dir.node_ops.rename(old_node, new_dir, new_name);
      old_node.parent = new_dir;
    } catch (e) {
      throw e;
    } finally {
      FS.hashAddNode(old_node);
    }
  }, rmdir(path) {
    var lookup = FS.lookupPath(path, { parent: true });
    var parent = lookup.node;
    var name = PATH.basename(path);
    var node = FS.lookupNode(parent, name);
    var errCode = FS.mayDelete(parent, name, true);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.rmdir) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isMountpoint(node)) {
      throw new FS.ErrnoError(10);
    }
    parent.node_ops.rmdir(parent, name);
    FS.destroyNode(node);
  }, readdir(path) {
    var lookup = FS.lookupPath(path, { follow: true });
    var node = lookup.node;
    var readdir = FS.checkOpExists(node.node_ops.readdir, 54);
    return readdir(node);
  }, unlink(path) {
    var lookup = FS.lookupPath(path, { parent: true });
    var parent = lookup.node;
    if (!parent) {
      throw new FS.ErrnoError(44);
    }
    var name = PATH.basename(path);
    var node = FS.lookupNode(parent, name);
    var errCode = FS.mayDelete(parent, name, false);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.unlink) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isMountpoint(node)) {
      throw new FS.ErrnoError(10);
    }
    parent.node_ops.unlink(parent, name);
    FS.destroyNode(node);
  }, readlink(path) {
    var lookup = FS.lookupPath(path);
    var link = lookup.node;
    if (!link) {
      throw new FS.ErrnoError(44);
    }
    if (!link.node_ops.readlink) {
      throw new FS.ErrnoError(28);
    }
    return link.node_ops.readlink(link);
  }, stat(path, dontFollow) {
    var lookup = FS.lookupPath(path, { follow: !dontFollow });
    var node = lookup.node;
    var getattr = FS.checkOpExists(node.node_ops.getattr, 63);
    return getattr(node);
  }, fstat(fd) {
    var stream = FS.getStreamChecked(fd);
    var node = stream.node;
    var getattr = stream.stream_ops.getattr;
    var arg = getattr ? stream : node;
    getattr ?? (getattr = node.node_ops.getattr);
    FS.checkOpExists(getattr, 63);
    return getattr(arg);
  }, lstat(path) {
    return FS.stat(path, true);
  }, doChmod(stream, node, mode, dontFollow) {
    FS.doSetAttr(stream, node, { mode: mode & 4095 | node.mode & ~4095, ctime: Date.now(), dontFollow });
  }, chmod(path, mode, dontFollow) {
    var node;
    if (typeof path == "string") {
      var lookup = FS.lookupPath(path, { follow: !dontFollow });
      node = lookup.node;
    } else {
      node = path;
    }
    FS.doChmod(null, node, mode, dontFollow);
  }, lchmod(path, mode) {
    FS.chmod(path, mode, true);
  }, fchmod(fd, mode) {
    var stream = FS.getStreamChecked(fd);
    FS.doChmod(stream, stream.node, mode, false);
  }, doChown(stream, node, dontFollow) {
    FS.doSetAttr(stream, node, { timestamp: Date.now(), dontFollow });
  }, chown(path, uid, gid, dontFollow) {
    var node;
    if (typeof path == "string") {
      var lookup = FS.lookupPath(path, { follow: !dontFollow });
      node = lookup.node;
    } else {
      node = path;
    }
    FS.doChown(null, node, dontFollow);
  }, lchown(path, uid, gid) {
    FS.chown(path, uid, gid, true);
  }, fchown(fd, uid, gid) {
    var stream = FS.getStreamChecked(fd);
    FS.doChown(stream, stream.node, false);
  }, doTruncate(stream, node, len) {
    if (FS.isDir(node.mode)) {
      throw new FS.ErrnoError(31);
    }
    if (!FS.isFile(node.mode)) {
      throw new FS.ErrnoError(28);
    }
    var errCode = FS.nodePermissions(node, "w");
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    FS.doSetAttr(stream, node, { size: len, timestamp: Date.now() });
  }, truncate(path, len) {
    if (len < 0) {
      throw new FS.ErrnoError(28);
    }
    var node;
    if (typeof path == "string") {
      var lookup = FS.lookupPath(path, { follow: true });
      node = lookup.node;
    } else {
      node = path;
    }
    FS.doTruncate(null, node, len);
  }, ftruncate(fd, len) {
    var stream = FS.getStreamChecked(fd);
    if (len < 0 || (stream.flags & 2097155) === 0) {
      throw new FS.ErrnoError(28);
    }
    FS.doTruncate(stream, stream.node, len);
  }, utime(path, atime, mtime) {
    var lookup = FS.lookupPath(path, { follow: true });
    var node = lookup.node;
    var setattr = FS.checkOpExists(node.node_ops.setattr, 63);
    setattr(node, { atime, mtime });
  }, open(path, flags, mode = 438) {
    if (path === "") {
      throw new FS.ErrnoError(44);
    }
    flags = typeof flags == "string" ? FS_modeStringToFlags(flags) : flags;
    if (flags & 64) {
      mode = mode & 4095 | 32768;
    } else {
      mode = 0;
    }
    var node;
    var isDirPath;
    if (typeof path == "object") {
      node = path;
    } else {
      isDirPath = path.endsWith("/");
      var lookup = FS.lookupPath(path, { follow: !(flags & 131072), noent_okay: true });
      node = lookup.node;
      path = lookup.path;
    }
    var created = false;
    if (flags & 64) {
      if (node) {
        if (flags & 128) {
          throw new FS.ErrnoError(20);
        }
      } else if (isDirPath) {
        throw new FS.ErrnoError(31);
      } else {
        node = FS.mknod(path, mode | 511, 0);
        created = true;
      }
    }
    if (!node) {
      throw new FS.ErrnoError(44);
    }
    if (FS.isChrdev(node.mode)) {
      flags &= ~512;
    }
    if (flags & 65536 && !FS.isDir(node.mode)) {
      throw new FS.ErrnoError(54);
    }
    if (!created) {
      var errCode = FS.mayOpen(node, flags);
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
    }
    if (flags & 512 && !created) {
      FS.truncate(node, 0);
    }
    flags &= ~(128 | 512 | 131072);
    var stream = FS.createStream({ node, path: FS.getPath(node), flags, seekable: true, position: 0, stream_ops: node.stream_ops, ungotten: [], error: false });
    if (stream.stream_ops.open) {
      stream.stream_ops.open(stream);
    }
    if (created) {
      FS.chmod(node, mode & 511);
    }
    if (Module["logReadFiles"] && !(flags & 1)) {
      if (!(path in FS.readFiles)) {
        FS.readFiles[path] = 1;
      }
    }
    return stream;
  }, close(stream) {
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if (stream.getdents) stream.getdents = null;
    try {
      if (stream.stream_ops.close) {
        stream.stream_ops.close(stream);
      }
    } catch (e) {
      throw e;
    } finally {
      FS.closeStream(stream.fd);
    }
    stream.fd = null;
  }, isClosed(stream) {
    return stream.fd === null;
  }, llseek(stream, offset, whence) {
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if (!stream.seekable || !stream.stream_ops.llseek) {
      throw new FS.ErrnoError(70);
    }
    if (whence != 0 && whence != 1 && whence != 2) {
      throw new FS.ErrnoError(28);
    }
    stream.position = stream.stream_ops.llseek(stream, offset, whence);
    stream.ungotten = [];
    return stream.position;
  }, read(stream, buffer, offset, length, position) {
    if (length < 0 || position < 0) {
      throw new FS.ErrnoError(28);
    }
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if ((stream.flags & 2097155) === 1) {
      throw new FS.ErrnoError(8);
    }
    if (FS.isDir(stream.node.mode)) {
      throw new FS.ErrnoError(31);
    }
    if (!stream.stream_ops.read) {
      throw new FS.ErrnoError(28);
    }
    var seeking = typeof position != "undefined";
    if (!seeking) {
      position = stream.position;
    } else if (!stream.seekable) {
      throw new FS.ErrnoError(70);
    }
    var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
    if (!seeking) stream.position += bytesRead;
    return bytesRead;
  }, write(stream, buffer, offset, length, position, canOwn) {
    if (length < 0 || position < 0) {
      throw new FS.ErrnoError(28);
    }
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if ((stream.flags & 2097155) === 0) {
      throw new FS.ErrnoError(8);
    }
    if (FS.isDir(stream.node.mode)) {
      throw new FS.ErrnoError(31);
    }
    if (!stream.stream_ops.write) {
      throw new FS.ErrnoError(28);
    }
    if (stream.seekable && stream.flags & 1024) {
      FS.llseek(stream, 0, 2);
    }
    var seeking = typeof position != "undefined";
    if (!seeking) {
      position = stream.position;
    } else if (!stream.seekable) {
      throw new FS.ErrnoError(70);
    }
    var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
    if (!seeking) stream.position += bytesWritten;
    return bytesWritten;
  }, mmap(stream, length, position, prot, flags) {
    if ((prot & 2) !== 0 && (flags & 2) === 0 && (stream.flags & 2097155) !== 2) {
      throw new FS.ErrnoError(2);
    }
    if ((stream.flags & 2097155) === 1) {
      throw new FS.ErrnoError(2);
    }
    if (!stream.stream_ops.mmap) {
      throw new FS.ErrnoError(43);
    }
    if (!length) {
      throw new FS.ErrnoError(28);
    }
    return stream.stream_ops.mmap(stream, length, position, prot, flags);
  }, msync(stream, buffer, offset, length, mmapFlags) {
    if (!stream.stream_ops.msync) {
      return 0;
    }
    return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
  }, ioctl(stream, cmd, arg) {
    if (!stream.stream_ops.ioctl) {
      throw new FS.ErrnoError(59);
    }
    return stream.stream_ops.ioctl(stream, cmd, arg);
  }, readFile(path, opts = {}) {
    opts.flags = opts.flags || 0;
    opts.encoding = opts.encoding || "binary";
    if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
      abort(`Invalid encoding type "${opts.encoding}"`);
    }
    var stream = FS.open(path, opts.flags);
    var stat = FS.stat(path);
    var length = stat.size;
    var buf = new Uint8Array(length);
    FS.read(stream, buf, 0, length, 0);
    if (opts.encoding === "utf8") {
      buf = UTF8ArrayToString(buf);
    }
    FS.close(stream);
    return buf;
  }, writeFile(path, data, opts = {}) {
    opts.flags = opts.flags || 577;
    var stream = FS.open(path, opts.flags, opts.mode);
    if (typeof data == "string") {
      data = new Uint8Array(intArrayFromString(data, true));
    }
    if (ArrayBuffer.isView(data)) {
      FS.write(stream, data, 0, data.byteLength, void 0, opts.canOwn);
    } else {
      abort("Unsupported data type");
    }
    FS.close(stream);
  }, cwd: () => FS.currentPath, chdir(path) {
    var lookup = FS.lookupPath(path, { follow: true });
    if (lookup.node === null) {
      throw new FS.ErrnoError(44);
    }
    if (!FS.isDir(lookup.node.mode)) {
      throw new FS.ErrnoError(54);
    }
    var errCode = FS.nodePermissions(lookup.node, "x");
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    FS.currentPath = lookup.path;
  }, createDefaultDirectories() {
    FS.mkdir("/tmp");
    FS.mkdir("/home");
    FS.mkdir("/home/web_user");
  }, createDefaultDevices() {
    FS.mkdir("/dev");
    FS.registerDevice(FS.makedev(1, 3), { read: () => 0, write: (stream, buffer, offset, length, pos) => length, llseek: () => 0 });
    FS.mkdev("/dev/null", FS.makedev(1, 3));
    TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
    TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
    FS.mkdev("/dev/tty", FS.makedev(5, 0));
    FS.mkdev("/dev/tty1", FS.makedev(6, 0));
    var randomBuffer = new Uint8Array(1024), randomLeft = 0;
    var randomByte = () => {
      if (randomLeft === 0) {
        randomFill(randomBuffer);
        randomLeft = randomBuffer.byteLength;
      }
      return randomBuffer[--randomLeft];
    };
    FS.createDevice("/dev", "random", randomByte);
    FS.createDevice("/dev", "urandom", randomByte);
    FS.mkdir("/dev/shm");
    FS.mkdir("/dev/shm/tmp");
  }, createSpecialDirectories() {
    FS.mkdir("/proc");
    var proc_self = FS.mkdir("/proc/self");
    FS.mkdir("/proc/self/fd");
    FS.mount({ mount() {
      var node = FS.createNode(proc_self, "fd", 16895, 73);
      node.stream_ops = { llseek: MEMFS.stream_ops.llseek };
      node.node_ops = { lookup(parent, name) {
        var fd = +name;
        var stream = FS.getStreamChecked(fd);
        var ret = { parent: null, mount: { mountpoint: "fake" }, node_ops: { readlink: () => stream.path }, id: fd + 1 };
        ret.parent = ret;
        return ret;
      }, readdir() {
        return Array.from(FS.streams.entries()).filter(([k, v]) => v).map(([k, v]) => k.toString());
      } };
      return node;
    } }, {}, "/proc/self/fd");
  }, createStandardStreams(input, output, error) {
    if (input) {
      FS.createDevice("/dev", "stdin", input);
    } else {
      FS.symlink("/dev/tty", "/dev/stdin");
    }
    if (output) {
      FS.createDevice("/dev", "stdout", null, output);
    } else {
      FS.symlink("/dev/tty", "/dev/stdout");
    }
    if (error) {
      FS.createDevice("/dev", "stderr", null, error);
    } else {
      FS.symlink("/dev/tty1", "/dev/stderr");
    }
    var stdin = FS.open("/dev/stdin", 0);
    var stdout = FS.open("/dev/stdout", 1);
    var stderr = FS.open("/dev/stderr", 1);
  }, staticInit() {
    FS.nameTable = new Array(4096);
    FS.mount(MEMFS, {}, "/");
    FS.createDefaultDirectories();
    FS.createDefaultDevices();
    FS.createSpecialDirectories();
    FS.filesystems = { MEMFS };
  }, init(input, output, error) {
    FS.initialized = true;
    input ?? (input = Module["stdin"]);
    output ?? (output = Module["stdout"]);
    error ?? (error = Module["stderr"]);
    FS.createStandardStreams(input, output, error);
  }, quit() {
    FS.initialized = false;
    for (var stream of FS.streams) {
      if (stream) {
        FS.close(stream);
      }
    }
  }, findObject(path, dontResolveLastLink) {
    var ret = FS.analyzePath(path, dontResolveLastLink);
    if (!ret.exists) {
      return null;
    }
    return ret.object;
  }, analyzePath(path, dontResolveLastLink) {
    try {
      var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
      path = lookup.path;
    } catch (e) {
    }
    var ret = { isRoot: false, exists: false, error: 0, name: null, path: null, object: null, parentExists: false, parentPath: null, parentObject: null };
    try {
      var lookup = FS.lookupPath(path, { parent: true });
      ret.parentExists = true;
      ret.parentPath = lookup.path;
      ret.parentObject = lookup.node;
      ret.name = PATH.basename(path);
      lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
      ret.exists = true;
      ret.path = lookup.path;
      ret.object = lookup.node;
      ret.name = lookup.node.name;
      ret.isRoot = lookup.path === "/";
    } catch (e) {
      ret.error = e.errno;
    }
    return ret;
  }, createPath(parent, path, canRead, canWrite) {
    parent = typeof parent == "string" ? parent : FS.getPath(parent);
    var parts = path.split("/").reverse();
    while (parts.length) {
      var part = parts.pop();
      if (!part) continue;
      var current = PATH.join2(parent, part);
      try {
        FS.mkdir(current);
      } catch (e) {
        if (e.errno != 20) throw e;
      }
      parent = current;
    }
    return current;
  }, createFile(parent, name, properties, canRead, canWrite) {
    var path = PATH.join2(typeof parent == "string" ? parent : FS.getPath(parent), name);
    var mode = FS_getMode(canRead, canWrite);
    return FS.create(path, mode);
  }, createDataFile(parent, name, data, canRead, canWrite, canOwn) {
    var path = name;
    if (parent) {
      parent = typeof parent == "string" ? parent : FS.getPath(parent);
      path = name ? PATH.join2(parent, name) : parent;
    }
    var mode = FS_getMode(canRead, canWrite);
    var node = FS.create(path, mode);
    if (data) {
      if (typeof data == "string") {
        var arr = new Array(data.length);
        for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
        data = arr;
      }
      FS.chmod(node, mode | 146);
      var stream = FS.open(node, 577);
      FS.write(stream, data, 0, data.length, 0, canOwn);
      FS.close(stream);
      FS.chmod(node, mode);
    }
  }, createDevice(parent, name, input, output) {
    var _a;
    var path = PATH.join2(typeof parent == "string" ? parent : FS.getPath(parent), name);
    var mode = FS_getMode(!!input, !!output);
    (_a = FS.createDevice).major ?? (_a.major = 64);
    var dev = FS.makedev(FS.createDevice.major++, 0);
    FS.registerDevice(dev, { open(stream) {
      stream.seekable = false;
    }, close(stream) {
      if (output?.buffer?.length) {
        output(10);
      }
    }, read(stream, buffer, offset, length, pos) {
      var bytesRead = 0;
      for (var i = 0; i < length; i++) {
        var result;
        try {
          result = input();
        } catch (e) {
          throw new FS.ErrnoError(29);
        }
        if (result === void 0 && bytesRead === 0) {
          throw new FS.ErrnoError(6);
        }
        if (result === null || result === void 0) break;
        bytesRead++;
        buffer[offset + i] = result;
      }
      if (bytesRead) {
        stream.node.atime = Date.now();
      }
      return bytesRead;
    }, write(stream, buffer, offset, length, pos) {
      for (var i = 0; i < length; i++) {
        try {
          output(buffer[offset + i]);
        } catch (e) {
          throw new FS.ErrnoError(29);
        }
      }
      if (length) {
        stream.node.mtime = stream.node.ctime = Date.now();
      }
      return i;
    } });
    return FS.mkdev(path, mode, dev);
  }, forceLoadFile(obj) {
    if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
    if (globalThis.XMLHttpRequest) {
      abort("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
    } else {
      try {
        obj.contents = readBinary(obj.url);
      } catch (e) {
        throw new FS.ErrnoError(29);
      }
    }
  }, createLazyFile(parent, name, url, canRead, canWrite) {
    class LazyUint8Array {
      constructor() {
        __publicField(this, "lengthKnown", false);
        __publicField(this, "chunks", []);
      }
      get(idx) {
        if (idx > this.length - 1 || idx < 0) {
          return void 0;
        }
        var chunkOffset = idx % this.chunkSize;
        var chunkNum = idx / this.chunkSize | 0;
        return this.getter(chunkNum)[chunkOffset];
      }
      setDataGetter(getter) {
        this.getter = getter;
      }
      cacheLength() {
        var xhr = new XMLHttpRequest();
        xhr.open("HEAD", url, false);
        xhr.send(null);
        if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) abort("Couldn't load " + url + ". Status: " + xhr.status);
        var datalength = Number(xhr.getResponseHeader("Content-length"));
        var header;
        var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
        var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
        var chunkSize = 1024 * 1024;
        if (!hasByteServing) chunkSize = datalength;
        var doXHR = (from, to) => {
          if (from > to) abort("invalid range (" + from + ", " + to + ") or no bytes requested!");
          if (to > datalength - 1) abort("only " + datalength + " bytes available! programmer error!");
          var xhr2 = new XMLHttpRequest();
          xhr2.open("GET", url, false);
          if (datalength !== chunkSize) xhr2.setRequestHeader("Range", "bytes=" + from + "-" + to);
          xhr2.responseType = "arraybuffer";
          if (xhr2.overrideMimeType) {
            xhr2.overrideMimeType("text/plain; charset=x-user-defined");
          }
          xhr2.send(null);
          if (!(xhr2.status >= 200 && xhr2.status < 300 || xhr2.status === 304)) abort("Couldn't load " + url + ". Status: " + xhr2.status);
          if (xhr2.response !== void 0) {
            return new Uint8Array(xhr2.response || []);
          }
          return intArrayFromString(xhr2.responseText || "", true);
        };
        var lazyArray2 = this;
        lazyArray2.setDataGetter((chunkNum) => {
          var start = chunkNum * chunkSize;
          var end = (chunkNum + 1) * chunkSize - 1;
          end = Math.min(end, datalength - 1);
          if (typeof lazyArray2.chunks[chunkNum] == "undefined") {
            lazyArray2.chunks[chunkNum] = doXHR(start, end);
          }
          if (typeof lazyArray2.chunks[chunkNum] == "undefined") abort("doXHR failed!");
          return lazyArray2.chunks[chunkNum];
        });
        if (usesGzip || !datalength) {
          chunkSize = datalength = 1;
          datalength = this.getter(0).length;
          chunkSize = datalength;
          out("LazyFiles on gzip forces download of the whole file when length is accessed");
        }
        this._length = datalength;
        this._chunkSize = chunkSize;
        this.lengthKnown = true;
      }
      get length() {
        if (!this.lengthKnown) {
          this.cacheLength();
        }
        return this._length;
      }
      get chunkSize() {
        if (!this.lengthKnown) {
          this.cacheLength();
        }
        return this._chunkSize;
      }
    }
    if (globalThis.XMLHttpRequest) {
      if (!ENVIRONMENT_IS_WORKER) abort("Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc");
      var lazyArray = new LazyUint8Array();
      var properties = { isDevice: false, contents: lazyArray };
    } else {
      var properties = { isDevice: false, url };
    }
    var node = FS.createFile(parent, name, properties, canRead, canWrite);
    if (properties.contents) {
      node.contents = properties.contents;
    } else if (properties.url) {
      node.contents = null;
      node.url = properties.url;
    }
    Object.defineProperties(node, { usedBytes: { get: function() {
      return this.contents.length;
    } } });
    var stream_ops = {};
    for (const [key, fn] of Object.entries(node.stream_ops)) {
      stream_ops[key] = (...args) => {
        FS.forceLoadFile(node);
        return fn(...args);
      };
    }
    function writeChunks(stream, buffer, offset, length, position) {
      var contents = stream.node.contents;
      if (position >= contents.length) return 0;
      var size = Math.min(contents.length - position, length);
      if (contents.slice) {
        for (var i = 0; i < size; i++) {
          buffer[offset + i] = contents[position + i];
        }
      } else {
        for (var i = 0; i < size; i++) {
          buffer[offset + i] = contents.get(position + i);
        }
      }
      return size;
    }
    stream_ops.read = (stream, buffer, offset, length, position) => {
      FS.forceLoadFile(node);
      return writeChunks(stream, buffer, offset, length, position);
    };
    stream_ops.mmap = (stream, length, position, prot, flags) => {
      FS.forceLoadFile(node);
      var ptr = mmapAlloc(length);
      if (!ptr) {
        throw new FS.ErrnoError(48);
      }
      writeChunks(stream, HEAP8, ptr, length, position);
      return { ptr, allocated: true };
    };
    node.stream_ops = stream_ops;
    return node;
  } };
  var UTF8ToString = (ptr, maxBytesToRead, ignoreNul) => ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead, ignoreNul) : "";
  var SYSCALLS = { calculateAt(dirfd, path, allowEmpty) {
    if (PATH.isAbs(path)) {
      return path;
    }
    var dir;
    if (dirfd === -100) {
      dir = FS.cwd();
    } else {
      var dirstream = SYSCALLS.getStreamFromFD(dirfd);
      dir = dirstream.path;
    }
    if (path.length == 0) {
      if (!allowEmpty) {
        throw new FS.ErrnoError(44);
      }
      return dir;
    }
    return dir + "/" + path;
  }, writeStat(buf, stat) {
    HEAPU32[buf >> 2] = stat.dev;
    HEAPU32[buf + 4 >> 2] = stat.mode;
    HEAPU32[buf + 8 >> 2] = stat.nlink;
    HEAPU32[buf + 12 >> 2] = stat.uid;
    HEAPU32[buf + 16 >> 2] = stat.gid;
    HEAPU32[buf + 20 >> 2] = stat.rdev;
    HEAP64[buf + 24 >> 3] = BigInt(stat.size);
    HEAP32[buf + 32 >> 2] = 4096;
    HEAP32[buf + 36 >> 2] = stat.blocks;
    var atime = stat.atime.getTime();
    var mtime = stat.mtime.getTime();
    var ctime = stat.ctime.getTime();
    HEAP64[buf + 40 >> 3] = BigInt(Math.floor(atime / 1e3));
    HEAPU32[buf + 48 >> 2] = atime % 1e3 * 1e3 * 1e3;
    HEAP64[buf + 56 >> 3] = BigInt(Math.floor(mtime / 1e3));
    HEAPU32[buf + 64 >> 2] = mtime % 1e3 * 1e3 * 1e3;
    HEAP64[buf + 72 >> 3] = BigInt(Math.floor(ctime / 1e3));
    HEAPU32[buf + 80 >> 2] = ctime % 1e3 * 1e3 * 1e3;
    HEAP64[buf + 88 >> 3] = BigInt(stat.ino);
    return 0;
  }, writeStatFs(buf, stats) {
    HEAPU32[buf + 4 >> 2] = stats.bsize;
    HEAPU32[buf + 60 >> 2] = stats.bsize;
    HEAP64[buf + 8 >> 3] = BigInt(stats.blocks);
    HEAP64[buf + 16 >> 3] = BigInt(stats.bfree);
    HEAP64[buf + 24 >> 3] = BigInt(stats.bavail);
    HEAP64[buf + 32 >> 3] = BigInt(stats.files);
    HEAP64[buf + 40 >> 3] = BigInt(stats.ffree);
    HEAPU32[buf + 48 >> 2] = stats.fsid;
    HEAPU32[buf + 64 >> 2] = stats.flags;
    HEAPU32[buf + 56 >> 2] = stats.namelen;
  }, doMsync(addr, stream, len, flags, offset) {
    if (!FS.isFile(stream.node.mode)) {
      throw new FS.ErrnoError(43);
    }
    if (flags & 2) {
      return 0;
    }
    var buffer = HEAPU8.slice(addr, addr + len);
    FS.msync(stream, buffer, offset, len, flags);
  }, getStreamFromFD(fd) {
    var stream = FS.getStreamChecked(fd);
    return stream;
  }, varargs: void 0, getStr(ptr) {
    var ret = UTF8ToString(ptr);
    return ret;
  } };
  function ___syscall_fcntl64(fd, cmd, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var stream = SYSCALLS.getStreamFromFD(fd);
      switch (cmd) {
        case 0: {
          var arg = syscallGetVarargI();
          if (arg < 0) {
            return -28;
          }
          while (FS.streams[arg]) {
            arg++;
          }
          var newStream;
          newStream = FS.dupStream(stream, arg);
          return newStream.fd;
        }
        case 1:
        case 2:
          return 0;
        case 3:
          return stream.flags;
        case 4: {
          var arg = syscallGetVarargI();
          stream.flags |= arg;
          return 0;
        }
        case 12: {
          var arg = syscallGetVarargP();
          var offset = 0;
          HEAP16[arg + offset >> 1] = 2;
          return 0;
        }
        case 13:
        case 14:
          return 0;
      }
      return -28;
    } catch (e) {
      if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
      return -e.errno;
    }
  }
  function ___syscall_ioctl(fd, op, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var stream = SYSCALLS.getStreamFromFD(fd);
      switch (op) {
        case 21509: {
          if (!stream.tty) return -59;
          return 0;
        }
        case 21505: {
          if (!stream.tty) return -59;
          if (stream.tty.ops.ioctl_tcgets) {
            var termios = stream.tty.ops.ioctl_tcgets(stream);
            var argp = syscallGetVarargP();
            HEAP32[argp >> 2] = termios.c_iflag || 0;
            HEAP32[argp + 4 >> 2] = termios.c_oflag || 0;
            HEAP32[argp + 8 >> 2] = termios.c_cflag || 0;
            HEAP32[argp + 12 >> 2] = termios.c_lflag || 0;
            for (var i = 0; i < 32; i++) {
              HEAP8[argp + i + 17] = termios.c_cc[i] || 0;
            }
            return 0;
          }
          return 0;
        }
        case 21510:
        case 21511:
        case 21512: {
          if (!stream.tty) return -59;
          return 0;
        }
        case 21506:
        case 21507:
        case 21508: {
          if (!stream.tty) return -59;
          if (stream.tty.ops.ioctl_tcsets) {
            var argp = syscallGetVarargP();
            var c_iflag = HEAP32[argp >> 2];
            var c_oflag = HEAP32[argp + 4 >> 2];
            var c_cflag = HEAP32[argp + 8 >> 2];
            var c_lflag = HEAP32[argp + 12 >> 2];
            var c_cc = [];
            for (var i = 0; i < 32; i++) {
              c_cc.push(HEAP8[argp + i + 17]);
            }
            return stream.tty.ops.ioctl_tcsets(stream.tty, op, { c_iflag, c_oflag, c_cflag, c_lflag, c_cc });
          }
          return 0;
        }
        case 21519: {
          if (!stream.tty) return -59;
          var argp = syscallGetVarargP();
          HEAP32[argp >> 2] = 0;
          return 0;
        }
        case 21520: {
          if (!stream.tty) return -59;
          return -28;
        }
        case 21537:
        case 21531: {
          var argp = syscallGetVarargP();
          return FS.ioctl(stream, op, argp);
        }
        case 21523: {
          if (!stream.tty) return -59;
          if (stream.tty.ops.ioctl_tiocgwinsz) {
            var winsize = stream.tty.ops.ioctl_tiocgwinsz(stream.tty);
            var argp = syscallGetVarargP();
            HEAP16[argp >> 1] = winsize[0];
            HEAP16[argp + 2 >> 1] = winsize[1];
          }
          return 0;
        }
        case 21524: {
          if (!stream.tty) return -59;
          return 0;
        }
        case 21515: {
          if (!stream.tty) return -59;
          return 0;
        }
        default:
          return -28;
      }
    } catch (e) {
      if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
      return -e.errno;
    }
  }
  function ___syscall_openat(dirfd, path, flags, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      path = SYSCALLS.getStr(path);
      path = SYSCALLS.calculateAt(dirfd, path);
      var mode = varargs ? syscallGetVarargI() : 0;
      return FS.open(path, flags, mode).fd;
    } catch (e) {
      if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
      return -e.errno;
    }
  }
  var __abort_js = () => abort("");
  var runtimeKeepaliveCounter = 0;
  var __emscripten_runtime_keepalive_clear = () => {
    noExitRuntime = false;
    runtimeKeepaliveCounter = 0;
  };
  var timers = {};
  var handleException = (e) => {
    if (e instanceof ExitStatus || e == "unwind") {
      return EXITSTATUS;
    }
    quit_(1, e);
  };
  var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
  var _proc_exit = (code) => {
    EXITSTATUS = code;
    if (!keepRuntimeAlive()) {
      Module["onExit"]?.(code);
      ABORT = true;
    }
    quit_(code, new ExitStatus(code));
  };
  var exitJS = (status, implicit) => {
    EXITSTATUS = status;
    _proc_exit(status);
  };
  var _exit = exitJS;
  var maybeExit = () => {
    if (!keepRuntimeAlive()) {
      try {
        _exit(EXITSTATUS);
      } catch (e) {
        handleException(e);
      }
    }
  };
  var callUserCallback = (func) => {
    if (ABORT) {
      return;
    }
    try {
      return func();
    } catch (e) {
      handleException(e);
    } finally {
      maybeExit();
    }
  };
  var _emscripten_get_now = () => performance.now();
  var __setitimer_js = (which, timeout_ms) => {
    if (timers[which]) {
      clearTimeout(timers[which].id);
      delete timers[which];
    }
    if (!timeout_ms) return 0;
    var id = setTimeout(() => {
      delete timers[which];
      callUserCallback(() => __emscripten_timeout(which, _emscripten_get_now()));
    }, timeout_ms);
    timers[which] = { id, timeout_ms };
    return 0;
  };
  var getHeapMax = () => 2147483648;
  var alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment;
  var growMemory = (size) => {
    var oldHeapSize = wasmMemory.buffer.byteLength;
    var pages = (size - oldHeapSize + 65535) / 65536 | 0;
    try {
      wasmMemory.grow(pages);
      updateMemoryViews();
      return 1;
    } catch (e) {
    }
  };
  var _emscripten_resize_heap = (requestedSize) => {
    var oldSize = HEAPU8.length;
    requestedSize >>>= 0;
    var maxHeapSize = getHeapMax();
    if (requestedSize > maxHeapSize) {
      return false;
    }
    for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
      var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
      overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
      var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
      var replacement = growMemory(newSize);
      if (replacement) {
        return true;
      }
    }
    return false;
  };
  function _fd_close(fd) {
    try {
      var stream = SYSCALLS.getStreamFromFD(fd);
      FS.close(stream);
      return 0;
    } catch (e) {
      if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
      return e.errno;
    }
  }
  var doReadv = (stream, iov, iovcnt, offset) => {
    var ret = 0;
    for (var i = 0; i < iovcnt; i++) {
      var ptr = HEAPU32[iov >> 2];
      var len = HEAPU32[iov + 4 >> 2];
      iov += 8;
      var curr = FS.read(stream, HEAP8, ptr, len, offset);
      if (curr < 0) return -1;
      ret += curr;
      if (curr < len) break;
      if (typeof offset != "undefined") {
        offset += curr;
      }
    }
    return ret;
  };
  function _fd_read(fd, iov, iovcnt, pnum) {
    try {
      var stream = SYSCALLS.getStreamFromFD(fd);
      var num = doReadv(stream, iov, iovcnt);
      HEAPU32[pnum >> 2] = num;
      return 0;
    } catch (e) {
      if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
      return e.errno;
    }
  }
  var INT53_MAX = 9007199254740992;
  var INT53_MIN = -9007199254740992;
  var bigintToI53Checked = (num) => num < INT53_MIN || num > INT53_MAX ? NaN : Number(num);
  function _fd_seek(fd, offset, whence, newOffset) {
    offset = bigintToI53Checked(offset);
    try {
      if (isNaN(offset)) return 61;
      var stream = SYSCALLS.getStreamFromFD(fd);
      FS.llseek(stream, offset, whence);
      HEAP64[newOffset >> 3] = BigInt(stream.position);
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null;
      return 0;
    } catch (e) {
      if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
      return e.errno;
    }
  }
  var doWritev = (stream, iov, iovcnt, offset) => {
    var ret = 0;
    for (var i = 0; i < iovcnt; i++) {
      var ptr = HEAPU32[iov >> 2];
      var len = HEAPU32[iov + 4 >> 2];
      iov += 8;
      var curr = FS.write(stream, HEAP8, ptr, len, offset);
      if (curr < 0) return -1;
      ret += curr;
      if (curr < len) {
        break;
      }
      if (typeof offset != "undefined") {
        offset += curr;
      }
    }
    return ret;
  };
  function _fd_write(fd, iov, iovcnt, pnum) {
    try {
      var stream = SYSCALLS.getStreamFromFD(fd);
      var num = doWritev(stream, iov, iovcnt);
      HEAPU32[pnum >> 2] = num;
      return 0;
    } catch (e) {
      if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
      return e.errno;
    }
  }
  var getCFunc = (ident) => {
    var func = Module["_" + ident];
    return func;
  };
  var writeArrayToMemory = (array, buffer) => {
    HEAP8.set(array, buffer);
  };
  var stringToUTF8 = (str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
  var stackAlloc = (sz) => __emscripten_stack_alloc(sz);
  var stringToUTF8OnStack = (str) => {
    var size = lengthBytesUTF8(str) + 1;
    var ret = stackAlloc(size);
    stringToUTF8(str, ret, size);
    return ret;
  };
  var ccall = (ident, returnType, argTypes, args, opts) => {
    var toC = { string: (str) => {
      var ret2 = 0;
      if (str !== null && str !== void 0 && str !== 0) {
        ret2 = stringToUTF8OnStack(str);
      }
      return ret2;
    }, array: (arr) => {
      var ret2 = stackAlloc(arr.length);
      writeArrayToMemory(arr, ret2);
      return ret2;
    } };
    function convertReturnValue(ret2) {
      if (returnType === "string") {
        return UTF8ToString(ret2);
      }
      if (returnType === "boolean") return Boolean(ret2);
      return ret2;
    }
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    if (args) {
      for (var i = 0; i < args.length; i++) {
        var converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
    var ret = func(...cArgs);
    function onDone(ret2) {
      if (stack !== 0) stackRestore(stack);
      return convertReturnValue(ret2);
    }
    ret = onDone(ret);
    return ret;
  };
  var cwrap = (ident, returnType, argTypes, opts) => {
    var numericArgs = !argTypes || argTypes.every((type) => type === "number" || type === "boolean");
    var numericRet = returnType !== "string";
    if (numericRet && numericArgs && !opts) {
      return getCFunc(ident);
    }
    return (...args) => ccall(ident, returnType, argTypes, args, opts);
  };
  FS.createPreloadedFile = FS_createPreloadedFile;
  FS.preloadFile = FS_preloadFile;
  FS.staticInit();
  {
    if (Module["noExitRuntime"]) noExitRuntime = Module["noExitRuntime"];
    if (Module["preloadPlugins"]) preloadPlugins = Module["preloadPlugins"];
    if (Module["print"]) out = Module["print"];
    if (Module["printErr"]) err = Module["printErr"];
    if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
    if (Module["arguments"]) arguments_ = Module["arguments"];
    if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
    if (Module["preInit"]) {
      if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
      while (Module["preInit"].length > 0) {
        Module["preInit"].shift()();
      }
    }
  }
  Module["ccall"] = ccall;
  Module["cwrap"] = cwrap;
  Module["setValue"] = setValue;
  Module["getValue"] = getValue;
  Module["UTF8ToString"] = UTF8ToString;
  var _adl_init, _adl_close, _adl_setNumChips, _adl_getNumChips, _adl_getNumChipsObtained, _adl_setBank, _adl_getBanksCount, _adl_getBankNames, _adl_reserveBanks, _adl_getBank, _adl_getBankId, _adl_removeBank, _adl_getFirstBank, _adl_getNextBank, _adl_getInstrument, _adl_setInstrument, _adl_loadEmbeddedBank, _adl_setNumFourOpsChn, _adl_getNumFourOpsChn, _adl_getNumFourOpsChnObtained, _adl_setHVibrato, _adl_getHVibrato, _adl_setHTremolo, _adl_getHTremolo, _adl_setScaleModulators, _adl_setFullRangeBrightness, _adl_setAutoArpeggio, _adl_getAutoArpeggio, _adl_setLoopEnabled, _adl_setLoopCount, _adl_setLoopHooksOnly, _adl_setSoftPanEnabled, _adl_setVolumeRangeModel, _adl_getVolumeRangeModel, _adl_setChannelAllocMode, _adl_getChannelAllocMode, _adl_openBankFile, _adl_openBankData, _adl_openData, _adl_selectSongNum, _adl_getSongsCount, _adl_chipEmulatorName, _adl_switchEmulator, _adl_setRunAtPcmRate, _adl_linkedLibraryVersion, _adl_linkedVersion, _adl_errorString, _adl_errorInfo, _adl_reset, _adl_totalTimeLength, _adl_loopStartTime, _adl_loopEndTime, _adl_positionTell, _adl_positionSeek, _adl_positionRewind, _adl_setTempo, _adl_describeChannels, _adl_metaMusicTitle, _adl_metaMusicCopyright, _adl_metaTrackTitleCount, _adl_metaTrackTitle, _adl_metaMarkerCount, _adl_play, _adl_playFormat, _adl_generate, _adl_generateFormat, _adl_atEnd, _adl_trackCount, _adl_setTrackOptions, _adl_setChannelEnabled, _adl_panic, _adl_rt_resetState, _adl_rt_noteOn, _adl_rt_noteOff, _adl_rt_noteAfterTouch, _adl_rt_channelAfterTouch, _adl_rt_controllerChange, _adl_rt_patchChange, _adl_rt_pitchBend, _adl_rt_pitchBendML, _adl_rt_bankChangeLSB, _adl_rt_bankChangeMSB, _adl_rt_bankChange, _adl_rt_systemExclusive, _adl_rt_rawOPL3, _adl_reserveChipChannels, _adl_getReservedChipChannels, __emscripten_timeout, _malloc, _free, __emscripten_stack_restore, __emscripten_stack_alloc, _emscripten_stack_get_current, memory, __indirect_function_table, wasmMemory;
  function assignWasmExports(wasmExports2) {
    _adl_init = Module["_adl_init"] = wasmExports2["p"];
    _adl_close = Module["_adl_close"] = wasmExports2["q"];
    _adl_setNumChips = Module["_adl_setNumChips"] = wasmExports2["r"];
    _adl_getNumChips = Module["_adl_getNumChips"] = wasmExports2["s"];
    _adl_getNumChipsObtained = Module["_adl_getNumChipsObtained"] = wasmExports2["t"];
    _adl_setBank = Module["_adl_setBank"] = wasmExports2["u"];
    _adl_getBanksCount = Module["_adl_getBanksCount"] = wasmExports2["v"];
    _adl_getBankNames = Module["_adl_getBankNames"] = wasmExports2["w"];
    _adl_reserveBanks = Module["_adl_reserveBanks"] = wasmExports2["x"];
    _adl_getBank = Module["_adl_getBank"] = wasmExports2["y"];
    _adl_getBankId = Module["_adl_getBankId"] = wasmExports2["z"];
    _adl_removeBank = Module["_adl_removeBank"] = wasmExports2["A"];
    _adl_getFirstBank = Module["_adl_getFirstBank"] = wasmExports2["B"];
    _adl_getNextBank = Module["_adl_getNextBank"] = wasmExports2["C"];
    _adl_getInstrument = Module["_adl_getInstrument"] = wasmExports2["D"];
    _adl_setInstrument = Module["_adl_setInstrument"] = wasmExports2["E"];
    _adl_loadEmbeddedBank = Module["_adl_loadEmbeddedBank"] = wasmExports2["F"];
    _adl_setNumFourOpsChn = Module["_adl_setNumFourOpsChn"] = wasmExports2["G"];
    _adl_getNumFourOpsChn = Module["_adl_getNumFourOpsChn"] = wasmExports2["H"];
    _adl_getNumFourOpsChnObtained = Module["_adl_getNumFourOpsChnObtained"] = wasmExports2["I"];
    _adl_setHVibrato = Module["_adl_setHVibrato"] = wasmExports2["J"];
    _adl_getHVibrato = Module["_adl_getHVibrato"] = wasmExports2["K"];
    _adl_setHTremolo = Module["_adl_setHTremolo"] = wasmExports2["L"];
    _adl_getHTremolo = Module["_adl_getHTremolo"] = wasmExports2["M"];
    _adl_setScaleModulators = Module["_adl_setScaleModulators"] = wasmExports2["N"];
    _adl_setFullRangeBrightness = Module["_adl_setFullRangeBrightness"] = wasmExports2["O"];
    _adl_setAutoArpeggio = Module["_adl_setAutoArpeggio"] = wasmExports2["P"];
    _adl_getAutoArpeggio = Module["_adl_getAutoArpeggio"] = wasmExports2["Q"];
    _adl_setLoopEnabled = Module["_adl_setLoopEnabled"] = wasmExports2["R"];
    _adl_setLoopCount = Module["_adl_setLoopCount"] = wasmExports2["S"];
    _adl_setLoopHooksOnly = Module["_adl_setLoopHooksOnly"] = wasmExports2["T"];
    _adl_setSoftPanEnabled = Module["_adl_setSoftPanEnabled"] = wasmExports2["U"];
    _adl_setVolumeRangeModel = Module["_adl_setVolumeRangeModel"] = wasmExports2["V"];
    _adl_getVolumeRangeModel = Module["_adl_getVolumeRangeModel"] = wasmExports2["W"];
    _adl_setChannelAllocMode = Module["_adl_setChannelAllocMode"] = wasmExports2["X"];
    _adl_getChannelAllocMode = Module["_adl_getChannelAllocMode"] = wasmExports2["Y"];
    _adl_openBankFile = Module["_adl_openBankFile"] = wasmExports2["Z"];
    _adl_openBankData = Module["_adl_openBankData"] = wasmExports2["_"];
    _adl_openData = Module["_adl_openData"] = wasmExports2["$"];
    _adl_selectSongNum = Module["_adl_selectSongNum"] = wasmExports2["aa"];
    _adl_getSongsCount = Module["_adl_getSongsCount"] = wasmExports2["ba"];
    _adl_chipEmulatorName = Module["_adl_chipEmulatorName"] = wasmExports2["ca"];
    _adl_switchEmulator = Module["_adl_switchEmulator"] = wasmExports2["da"];
    _adl_setRunAtPcmRate = Module["_adl_setRunAtPcmRate"] = wasmExports2["ea"];
    _adl_linkedLibraryVersion = Module["_adl_linkedLibraryVersion"] = wasmExports2["fa"];
    _adl_linkedVersion = Module["_adl_linkedVersion"] = wasmExports2["ga"];
    _adl_errorString = Module["_adl_errorString"] = wasmExports2["ha"];
    _adl_errorInfo = Module["_adl_errorInfo"] = wasmExports2["ia"];
    _adl_reset = Module["_adl_reset"] = wasmExports2["ja"];
    _adl_totalTimeLength = Module["_adl_totalTimeLength"] = wasmExports2["ka"];
    _adl_loopStartTime = Module["_adl_loopStartTime"] = wasmExports2["la"];
    _adl_loopEndTime = Module["_adl_loopEndTime"] = wasmExports2["ma"];
    _adl_positionTell = Module["_adl_positionTell"] = wasmExports2["na"];
    _adl_positionSeek = Module["_adl_positionSeek"] = wasmExports2["oa"];
    _adl_positionRewind = Module["_adl_positionRewind"] = wasmExports2["pa"];
    _adl_setTempo = Module["_adl_setTempo"] = wasmExports2["qa"];
    _adl_describeChannels = Module["_adl_describeChannels"] = wasmExports2["ra"];
    _adl_metaMusicTitle = Module["_adl_metaMusicTitle"] = wasmExports2["sa"];
    _adl_metaMusicCopyright = Module["_adl_metaMusicCopyright"] = wasmExports2["ta"];
    _adl_metaTrackTitleCount = Module["_adl_metaTrackTitleCount"] = wasmExports2["ua"];
    _adl_metaTrackTitle = Module["_adl_metaTrackTitle"] = wasmExports2["va"];
    _adl_metaMarkerCount = Module["_adl_metaMarkerCount"] = wasmExports2["wa"];
    _adl_play = Module["_adl_play"] = wasmExports2["xa"];
    _adl_playFormat = Module["_adl_playFormat"] = wasmExports2["ya"];
    _adl_generate = Module["_adl_generate"] = wasmExports2["za"];
    _adl_generateFormat = Module["_adl_generateFormat"] = wasmExports2["Aa"];
    _adl_atEnd = Module["_adl_atEnd"] = wasmExports2["Ba"];
    _adl_trackCount = Module["_adl_trackCount"] = wasmExports2["Ca"];
    _adl_setTrackOptions = Module["_adl_setTrackOptions"] = wasmExports2["Da"];
    _adl_setChannelEnabled = Module["_adl_setChannelEnabled"] = wasmExports2["Ea"];
    _adl_panic = Module["_adl_panic"] = wasmExports2["Fa"];
    _adl_rt_resetState = Module["_adl_rt_resetState"] = wasmExports2["Ga"];
    _adl_rt_noteOn = Module["_adl_rt_noteOn"] = wasmExports2["Ha"];
    _adl_rt_noteOff = Module["_adl_rt_noteOff"] = wasmExports2["Ia"];
    _adl_rt_noteAfterTouch = Module["_adl_rt_noteAfterTouch"] = wasmExports2["Ja"];
    _adl_rt_channelAfterTouch = Module["_adl_rt_channelAfterTouch"] = wasmExports2["Ka"];
    _adl_rt_controllerChange = Module["_adl_rt_controllerChange"] = wasmExports2["La"];
    _adl_rt_patchChange = Module["_adl_rt_patchChange"] = wasmExports2["Ma"];
    _adl_rt_pitchBend = Module["_adl_rt_pitchBend"] = wasmExports2["Na"];
    _adl_rt_pitchBendML = Module["_adl_rt_pitchBendML"] = wasmExports2["Oa"];
    _adl_rt_bankChangeLSB = Module["_adl_rt_bankChangeLSB"] = wasmExports2["Pa"];
    _adl_rt_bankChangeMSB = Module["_adl_rt_bankChangeMSB"] = wasmExports2["Qa"];
    _adl_rt_bankChange = Module["_adl_rt_bankChange"] = wasmExports2["Ra"];
    _adl_rt_systemExclusive = Module["_adl_rt_systemExclusive"] = wasmExports2["Sa"];
    _adl_rt_rawOPL3 = Module["_adl_rt_rawOPL3"] = wasmExports2["Ta"];
    _adl_reserveChipChannels = Module["_adl_reserveChipChannels"] = wasmExports2["Ua"];
    _adl_getReservedChipChannels = Module["_adl_getReservedChipChannels"] = wasmExports2["Va"];
    __emscripten_timeout = wasmExports2["Wa"];
    _malloc = Module["_malloc"] = wasmExports2["Xa"];
    _free = Module["_free"] = wasmExports2["Ya"];
    __emscripten_stack_restore = wasmExports2["Za"];
    __emscripten_stack_alloc = wasmExports2["_a"];
    _emscripten_stack_get_current = wasmExports2["$a"];
    memory = wasmMemory = wasmExports2["n"];
    __indirect_function_table = wasmExports2["__indirect_function_table"];
  }
  var wasmImports = { a: ___cxa_throw, c: ___syscall_fcntl64, g: ___syscall_ioctl, h: ___syscall_openat, l: __abort_js, j: __emscripten_runtime_keepalive_clear, k: __setitimer_js, m: _emscripten_resize_heap, b: _fd_close, f: _fd_read, d: _fd_seek, e: _fd_write, i: _proc_exit };
  function run() {
    if (runDependencies > 0) {
      dependenciesFulfilled = run;
      return;
    }
    preRun();
    if (runDependencies > 0) {
      dependenciesFulfilled = run;
      return;
    }
    function doRun() {
      Module["calledRun"] = true;
      if (ABORT) return;
      initRuntime();
      readyPromiseResolve?.(Module);
      Module["onRuntimeInitialized"]?.();
      postRun();
    }
    if (Module["setStatus"]) {
      Module["setStatus"]("Running...");
      setTimeout(() => {
        setTimeout(() => Module["setStatus"](""), 1);
        doRun();
      }, 1);
    } else {
      doRun();
    }
  }
  var wasmExports;
  wasmExports = await createWasm();
  run();
  if (runtimeInitialized) {
    moduleRtn = Module;
  } else {
    moduleRtn = new Promise((resolve, reject) => {
      readyPromiseResolve = resolve;
      readyPromiseReject = reject;
    });
  }
  ;
  return moduleRtn;
}
var libadlmidi_dosbox_slim_browser_default = createADLMIDI;

// src/utils/struct.js
var SIZEOF_ADL_OPERATOR = 5;
var SIZEOF_ADL_INSTRUMENT = 40;
var SIZEOF_ADL_BANK = 12;
var SIZEOF_ADL_BANK_ID = 4;
var OPERATOR_OFFSET = 14;
function decodeOperator(bytes) {
  const avekf = bytes[0];
  const ksl_l = bytes[1];
  const atdec = bytes[2];
  const susrel = bytes[3];
  const waveform = bytes[4];
  return {
    // Register 0x20: AM/Vib/EG-type/KSR/Mult
    am: !!(avekf & 128),
    vibrato: !!(avekf & 64),
    sustaining: !!(avekf & 32),
    ksr: !!(avekf & 16),
    freqMult: avekf & 15,
    // Register 0x40: KSL/TL
    keyScaleLevel: ksl_l >> 6 & 3,
    totalLevel: ksl_l & 63,
    // Register 0x60: AR/DR
    attack: atdec >> 4 & 15,
    decay: atdec & 15,
    // Register 0x80: SL/RR
    sustain: susrel >> 4 & 15,
    release: susrel & 15,
    // Register 0xE0: Waveform
    waveform: waveform & 7
  };
}
function encodeOperator(op) {
  const avekf = (op.am ? 128 : 0) | (op.vibrato ? 64 : 0) | (op.sustaining ? 32 : 0) | (op.ksr ? 16 : 0) | op.freqMult & 15;
  const ksl_l = (op.keyScaleLevel & 3) << 6 | op.totalLevel & 63;
  const atdec = (op.attack & 15) << 4 | op.decay & 15;
  const susrel = (op.sustain & 15) << 4 | op.release & 15;
  const waveform = op.waveform & 7;
  return new Uint8Array([avekf, ksl_l, atdec, susrel, waveform]);
}
function defaultOperator() {
  return {
    am: false,
    vibrato: false,
    sustaining: true,
    ksr: false,
    freqMult: 1,
    keyScaleLevel: 0,
    totalLevel: 63,
    // Max attenuation (silent)
    attack: 15,
    decay: 0,
    sustain: 0,
    release: 15,
    waveform: 0
  };
}
function decodeInstrument(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, SIZEOF_ADL_INSTRUMENT);
  const version = view.getInt32(0, true);
  const noteOffset1 = view.getInt16(4, true);
  const noteOffset2 = view.getInt16(6, true);
  const velocityOffset = view.getInt8(8);
  const secondVoiceDetune = view.getInt8(9);
  const percussionKey = bytes[10];
  const instFlags = bytes[11];
  const fbConn1 = bytes[12];
  const fbConn2 = bytes[13];
  const operators = (
    /** @type {[Operator, Operator, Operator, Operator]} */
    [
      decodeOperator(bytes.slice(OPERATOR_OFFSET, OPERATOR_OFFSET + SIZEOF_ADL_OPERATOR)),
      decodeOperator(bytes.slice(OPERATOR_OFFSET + SIZEOF_ADL_OPERATOR, OPERATOR_OFFSET + 2 * SIZEOF_ADL_OPERATOR)),
      decodeOperator(bytes.slice(OPERATOR_OFFSET + 2 * SIZEOF_ADL_OPERATOR, OPERATOR_OFFSET + 3 * SIZEOF_ADL_OPERATOR)),
      decodeOperator(bytes.slice(OPERATOR_OFFSET + 3 * SIZEOF_ADL_OPERATOR, OPERATOR_OFFSET + 4 * SIZEOF_ADL_OPERATOR))
    ]
  );
  const delayOnMs = view.getUint16(34, true);
  const delayOffMs = view.getUint16(36, true);
  return {
    version,
    noteOffset1,
    noteOffset2,
    velocityOffset,
    secondVoiceDetune,
    percussionKey,
    // Decode flags
    is4op: !!(instFlags & 1),
    isPseudo4op: !!(instFlags & 2),
    isBlank: !!(instFlags & 4),
    rhythmMode: instFlags >> 3 & 7,
    // Decode feedback/connection
    feedback1: fbConn1 >> 1 & 7,
    connection1: fbConn1 & 1,
    feedback2: fbConn2 >> 1 & 7,
    connection2: fbConn2 & 1,
    operators,
    delayOnMs,
    delayOffMs
  };
}
function encodeInstrument(inst) {
  const bytes = new Uint8Array(SIZEOF_ADL_INSTRUMENT);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, inst.version || 0, true);
  view.setInt16(4, inst.noteOffset1 || 0, true);
  view.setInt16(6, inst.noteOffset2 || 0, true);
  view.setInt8(8, inst.velocityOffset || 0);
  view.setInt8(9, inst.secondVoiceDetune || 0);
  bytes[10] = inst.percussionKey || 0;
  let flags = 0;
  if (inst.is4op) flags |= 1;
  if (inst.isPseudo4op) flags |= 2;
  if (inst.isBlank) flags |= 4;
  flags |= ((inst.rhythmMode || 0) & 7) << 3;
  bytes[11] = flags;
  bytes[12] = ((inst.feedback1 || 0) & 7) << 1 | (inst.connection1 || 0) & 1;
  bytes[13] = ((inst.feedback2 || 0) & 7) << 1 | (inst.connection2 || 0) & 1;
  for (let i = 0; i < 4; i++) {
    const opBytes = encodeOperator(inst.operators?.[i] || defaultOperator());
    bytes.set(opBytes, OPERATOR_OFFSET + i * SIZEOF_ADL_OPERATOR);
  }
  view.setUint16(34, inst.delayOnMs || 0, true);
  view.setUint16(36, inst.delayOffMs || 0, true);
  return bytes;
}

// src/processor.js
var SAMPLE_RATE = 44100;
var CHANNELS = 2;
var BYTES_PER_SAMPLE = 2;
var _AdlMidiProcessor = class _AdlMidiProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.adl = null;
    this.midi = null;
    this.bufferPtr = null;
    this.ready = false;
    this.playMode = "realtime";
    this.sampleRate = options.processorOptions?.sampleRate || SAMPLE_RATE;
    this.cachedHeapBuffer = null;
    this.settings = {
      numChips: 4,
      // Number of emulated OPL3 chips
      numFourOpChannels: -1,
      // 4-op channels (-1 = auto)
      bank: 72,
      // FM bank number
      softPan: true,
      // Soft stereo panning
      deepVibrato: false,
      // Deep vibrato
      deepTremolo: false,
      // Deep tremolo
      emulator: void 0,
      // Emulator core (undefined = libADLMIDI default)
      ...options.processorOptions?.settings
    };
    this.initWasm(options.processorOptions);
    this.port.onmessage = (e) => this.handleMessage(e.data);
  }
  async initWasm(processorOptions) {
    try {
      let moduleConfig;
      if (processorOptions?.wasmBinary) {
        moduleConfig = {
          instantiateWasm: (imports, successCallback) => {
            WebAssembly.instantiate(processorOptions.wasmBinary, imports).then((result) => successCallback(result.instance));
            return {};
          }
        };
      }
      const Module = await libadlmidi_dosbox_slim_browser_default(moduleConfig);
      this.adl = Module;
      this.midi = this.adl._adl_init(this.sampleRate);
      if (!this.midi) {
        throw new Error("Failed to initialize ADL MIDI player");
      }
      this.applySettings(this.settings);
      const FRAMES = 128;
      this.bufferSize = FRAMES * CHANNELS * BYTES_PER_SAMPLE;
      this.bufferPtr = this.adl._malloc(this.bufferSize);
      if (!this.adl.HEAP16) {
        throw new Error("HEAP16 is not available after initialization");
      }
      this.ready = true;
      this.port.postMessage({ type: "ready" });
    } catch (error) {
      console.error("Failed to initialize WASM:", error);
      this.port.postMessage({ type: "error", message: error.message });
    }
  }
  /**
   * Apply synth settings
   */
  applySettings(settings) {
    if (!this.midi) return;
    if (settings.emulator !== void 0) {
      this.adl._adl_switchEmulator(this.midi, settings.emulator);
    }
    if (settings.numChips !== void 0) {
      this.adl._adl_setNumChips(this.midi, settings.numChips);
    }
    if (settings.numFourOpChannels !== void 0) {
      this.adl._adl_setNumFourOpsChn(this.midi, settings.numFourOpChannels);
    }
    if (settings.bank !== void 0) {
      this.adl._adl_setBank(this.midi, settings.bank);
    }
    if (settings.softPan !== void 0) {
      this.adl._adl_setSoftPanEnabled(this.midi, settings.softPan ? 1 : 0);
    }
    if (settings.deepVibrato !== void 0) {
      this.adl._adl_setHVibrato(this.midi, settings.deepVibrato ? 1 : 0);
    }
    if (settings.deepTremolo !== void 0) {
      this.adl._adl_setHTremolo(this.midi, settings.deepTremolo ? 1 : 0);
    }
  }
  /**
   * Decode an OPL3 operator from raw register bytes to named properties
   * @param {Uint8Array | number[]} bytes
   */
  decodeOperator(bytes) {
    return decodeOperator(bytes);
  }
  /**
   * Encode named operator properties to raw register bytes
   * @param {import('./utils/struct.js').Operator} op
   */
  encodeOperator(op) {
    return encodeOperator(op);
  }
  /**
   * Read ADL_Instrument from WASM memory and decode to JS object
   */
  readInstrumentFromMemory(ptr) {
    const bytes = this.adl.HEAPU8.slice(ptr, ptr + SIZEOF_ADL_INSTRUMENT);
    return decodeInstrument(bytes);
  }
  /**
   * Write JS instrument object to WASM memory
   */
  writeInstrumentToMemory(ptr, inst) {
    const bytes = encodeInstrument(inst);
    this.adl.HEAPU8.set(bytes, ptr);
  }
  /**
   * Default operator values (silent)
   */
  defaultOperator() {
    return defaultOperator();
  }
  /**
   * Get instrument from bank
   */
  getInstrument(bankId, programNumber) {
    try {
      const bankIdPtr = this.adl._malloc(4);
      this.adl.HEAPU8[bankIdPtr] = bankId.percussive ? 1 : 0;
      this.adl.HEAPU8[bankIdPtr + 1] = bankId.msb || 0;
      this.adl.HEAPU8[bankIdPtr + 2] = bankId.lsb || 0;
      const bankPtr = this.adl._malloc(_AdlMidiProcessor.SIZEOF_ADL_BANK);
      const bankResult = this.adl._adl_getBank(this.midi, bankIdPtr, 1, bankPtr);
      if (bankResult !== 0) {
        this.adl._free(bankIdPtr);
        this.adl._free(bankPtr);
        return { success: false, error: "Failed to get bank" };
      }
      const instPtr = this.adl._malloc(_AdlMidiProcessor.SIZEOF_ADL_INSTRUMENT);
      const instResult = this.adl._adl_getInstrument(this.midi, bankPtr, programNumber, instPtr);
      let instrument = null;
      if (instResult === 0) {
        instrument = this.readInstrumentFromMemory(instPtr);
      }
      this.adl._free(bankIdPtr);
      this.adl._free(bankPtr);
      this.adl._free(instPtr);
      if (instrument) {
        return { success: true, instrument };
      } else {
        return { success: false, error: "Failed to get instrument" };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  /**
   * Set instrument in bank
   */
  setInstrument(bankId, programNumber, instrument) {
    try {
      const bankIdPtr = this.adl._malloc(4);
      this.adl.HEAPU8[bankIdPtr] = bankId.percussive ? 1 : 0;
      this.adl.HEAPU8[bankIdPtr + 1] = bankId.msb || 0;
      this.adl.HEAPU8[bankIdPtr + 2] = bankId.lsb || 0;
      const bankPtr = this.adl._malloc(_AdlMidiProcessor.SIZEOF_ADL_BANK);
      const bankResult = this.adl._adl_getBank(this.midi, bankIdPtr, 1, bankPtr);
      if (bankResult !== 0) {
        this.adl._free(bankIdPtr);
        this.adl._free(bankPtr);
        return { success: false, error: "Failed to get/create bank" };
      }
      const instPtr = this.adl._malloc(_AdlMidiProcessor.SIZEOF_ADL_INSTRUMENT);
      this.writeInstrumentToMemory(instPtr, instrument);
      const setResult = this.adl._adl_setInstrument(this.midi, bankPtr, programNumber, instPtr);
      if (setResult === 0) {
        this.adl._adl_reset(this.midi);
      }
      this.adl._free(bankIdPtr);
      this.adl._free(bankPtr);
      this.adl._free(instPtr);
      if (setResult === 0) {
        return { success: true };
      } else {
        return { success: false, error: "Failed to set instrument" };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  handleMessage(msg) {
    if (!this.ready && msg.type !== "ping") return;
    switch (msg.type) {
      case "ping":
        this.port.postMessage({ type: "pong", ready: this.ready });
        break;
      case "noteOn":
        this.adl._adl_rt_noteOn(this.midi, msg.channel, msg.note, msg.velocity);
        break;
      case "noteOff":
        this.adl._adl_rt_noteOff(this.midi, msg.channel, msg.note);
        break;
      case "pitchBend":
        this.adl._adl_rt_pitchBendML(this.midi, msg.channel, msg.msb, msg.lsb);
        break;
      case "controlChange":
        this.adl._adl_rt_controllerChange(this.midi, msg.channel, msg.controller, msg.value);
        break;
      case "programChange":
        this.adl._adl_rt_patchChange(this.midi, msg.channel, msg.program);
        break;
      case "noteAfterTouch":
        this.adl._adl_rt_noteAfterTouch(this.midi, msg.channel, msg.note, msg.pressure);
        break;
      case "channelAfterTouch":
        this.adl._adl_rt_channelAfterTouch(this.midi, msg.channel, msg.pressure);
        break;
      case "bankChange":
        this.adl._adl_rt_bankChange(this.midi, msg.channel, msg.bank);
        break;
      case "bankChangeMSB":
        this.adl._adl_rt_bankChangeMSB(this.midi, msg.channel, msg.msb);
        break;
      case "bankChangeLSB":
        this.adl._adl_rt_bankChangeLSB(this.midi, msg.channel, msg.lsb);
        break;
      case "resetState":
        this.adl._adl_rt_resetState(this.midi);
        break;
      case "panic":
        this.adl._adl_panic(this.midi);
        break;
      case "configure":
        Object.assign(this.settings, msg.settings);
        this.applySettings(msg.settings);
        this.port.postMessage({ type: "configured" });
        break;
      case "loadBankData":
        this.loadBankData(msg.data);
        break;
      case "setBank": {
        const result = this.adl._adl_setBank(this.midi, msg.bank);
        this.port.postMessage({ type: "bankSet", success: result === 0, bank: msg.bank });
        break;
      }
      case "getInstrument": {
        const getResult = this.getInstrument(msg.bankId, msg.programNumber);
        this.port.postMessage({ type: "instrumentLoaded", ...getResult });
        break;
      }
      case "setInstrument": {
        const setResult = this.setInstrument(msg.bankId, msg.programNumber, msg.instrument);
        this.port.postMessage({ type: "instrumentSet", ...setResult });
        break;
      }
      case "setNumChips":
        this.adl._adl_setNumChips(this.midi, msg.chips);
        break;
      case "setNumFourOpChannels":
        this.adl._adl_setNumFourOpsChn(this.midi, msg.channels);
        break;
      case "getNumFourOpChannels":
        this.port.postMessage({ type: "numFourOpChannels", channels: this.adl._adl_getNumFourOpsChn(this.midi) });
        break;
      case "getNumFourOpChannelsObtained":
        this.port.postMessage({ type: "numFourOpChannelsObtained", channels: this.adl._adl_getNumFourOpsChnObtained(this.midi) });
        break;
      case "setScaleModulators":
        this.adl._adl_setScaleModulators(this.midi, msg.enabled ? 1 : 0);
        break;
      case "setFullRangeBrightness":
        this.adl._adl_setFullRangeBrightness(this.midi, msg.enabled ? 1 : 0);
        break;
      case "setAutoArpeggio":
        this.adl._adl_setAutoArpeggio(this.midi, msg.enabled ? 1 : 0);
        break;
      case "getAutoArpeggio":
        this.port.postMessage({ type: "autoArpeggio", enabled: this.adl._adl_getAutoArpeggio(this.midi) !== 0 });
        break;
      case "setChannelAllocMode":
        this.adl._adl_setChannelAllocMode(this.midi, msg.mode);
        break;
      case "getChannelAllocMode":
        this.port.postMessage({ type: "channelAllocMode", mode: this.adl._adl_getChannelAllocMode(this.midi) });
        break;
      case "setVolumeRangeModel":
        this.adl._adl_setVolumeRangeModel(this.midi, msg.model);
        break;
      case "setDeepVibrato":
        this.adl._adl_setHVibrato(this.midi, msg.enabled ? 1 : 0);
        break;
      case "getDeepVibrato":
        this.port.postMessage({ type: "deepVibrato", enabled: this.adl._adl_getHVibrato(this.midi) !== 0 });
        break;
      case "setDeepTremolo":
        this.adl._adl_setHTremolo(this.midi, msg.enabled ? 1 : 0);
        break;
      case "getDeepTremolo":
        this.port.postMessage({ type: "deepTremolo", enabled: this.adl._adl_getHTremolo(this.midi) !== 0 });
        break;
      case "setSoftPanEnabled":
        this.adl._adl_setSoftPanEnabled(this.midi, msg.enabled ? 1 : 0);
        break;
      case "setRunAtPcmRate":
        this.adl._adl_setRunAtPcmRate(this.midi, msg.enabled ? 1 : 0);
        break;
      case "switchEmulator": {
        const result = this.adl._adl_switchEmulator(this.midi, msg.emulator);
        this.port.postMessage({ type: "emulatorSwitched", success: result === 0, emulator: msg.emulator });
        break;
      }
      case "getEmulatorName": {
        const namePtr = this.adl._adl_chipEmulatorName(this.midi);
        const name = namePtr ? this.adl.UTF8ToString(namePtr) : "Unknown";
        this.port.postMessage({ type: "emulatorName", name });
        break;
      }
      case "getErrorInfo": {
        const ptr = this.adl._adl_errorInfo(this.midi);
        const info = ptr ? this.adl.UTF8ToString(ptr) : "";
        this.port.postMessage({ type: "errorInfo", info });
        break;
      }
      case "getLibraryVersion": {
        const ptr = this.adl._adl_linkedLibraryVersion();
        const version = ptr ? this.adl.UTF8ToString(ptr) : "Unknown";
        this.port.postMessage({ type: "libraryVersion", version });
        break;
      }
      case "getVersion": {
        const ptr = this.adl._adl_linkedVersion();
        const version = ptr ? {
          major: this.adl.getValue(ptr, "i16"),
          minor: this.adl.getValue(ptr + 2, "i16"),
          patch: this.adl.getValue(ptr + 4, "i16")
        } : null;
        this.port.postMessage({ type: "version", version });
        break;
      }
      case "getNumChips":
        this.port.postMessage({ type: "numChips", chips: this.adl._adl_getNumChips(this.midi) });
        break;
      case "getNumChipsObtained":
        this.port.postMessage({ type: "numChipsObtained", chips: this.adl._adl_getNumChipsObtained(this.midi) });
        break;
      case "getVolumeRangeModel":
        this.port.postMessage({ type: "volumeRangeModel", model: this.adl._adl_getVolumeRangeModel(this.midi) });
        break;
      case "getEmbeddedBanks": {
        const banks = this.getEmbeddedBankList();
        this.port.postMessage({ type: "embeddedBanks", banks });
        break;
      }
      // MIDI file playback
      case "loadMidi":
        this.loadMidiData(msg.data);
        break;
      case "getMusicTitle": {
        const ptr = this.adl._adl_metaMusicTitle(this.midi);
        const title = ptr ? this.adl.UTF8ToString(ptr) : "";
        this.port.postMessage({ type: "musicTitle", title });
        break;
      }
      case "getMusicCopyright": {
        const ptr = this.adl._adl_metaMusicCopyright(this.midi);
        const copyright = ptr ? this.adl.UTF8ToString(ptr) : "";
        this.port.postMessage({ type: "musicCopyright", copyright });
        break;
      }
      case "getTrackTitleCount":
        this.port.postMessage({ type: "trackTitleCount", count: this.adl._adl_metaTrackTitleCount(this.midi) });
        break;
      case "getTrackTitle": {
        const ptr = this.adl._adl_metaTrackTitle(this.midi, msg.index);
        const title = ptr ? this.adl.UTF8ToString(ptr) : "";
        this.port.postMessage({ type: "trackTitle", title, index: msg.index, reqId: msg.reqId });
        break;
      }
      case "getMarkerCount":
        this.port.postMessage({ type: "markerCount", count: this.adl._adl_metaMarkerCount(this.midi) });
        break;
      case "play":
        if (this.adl._adl_atEnd(this.midi) !== 0) {
          this.adl._adl_positionRewind(this.midi);
        }
        this.playMode = "file";
        break;
      case "stop":
        this.playMode = "realtime";
        this.adl._adl_positionRewind(this.midi);
        this.adl._adl_panic(this.midi);
        break;
      case "seek":
        this.adl._adl_positionSeek(this.midi, msg.position);
        break;
      case "setLoopEnabled":
        this.adl._adl_setLoopEnabled(this.midi, msg.enabled ? 1 : 0);
        break;
      case "setLoopCount":
        this.adl._adl_setLoopCount(this.midi, msg.count);
        break;
      case "setLoopHooksOnly":
        this.adl._adl_setLoopHooksOnly(this.midi, msg.enabled ? 1 : 0);
        break;
      case "getLoopStartTime":
        this.port.postMessage({ type: "loopStartTime", time: this.adl._adl_loopStartTime(this.midi) });
        break;
      case "getLoopEndTime":
        this.port.postMessage({ type: "loopEndTime", time: this.adl._adl_loopEndTime(this.midi) });
        break;
      case "selectSongNum":
        this.adl._adl_selectSongNum(this.midi, msg.num);
        break;
      case "getSongsCount":
        this.port.postMessage({ type: "songsCount", count: this.adl._adl_getSongsCount(this.midi) });
        break;
      case "getTrackCount":
        this.port.postMessage({ type: "trackCount", count: this.adl._adl_trackCount(this.midi) });
        break;
      case "setTrackOptions": {
        const result = this.adl._adl_setTrackOptions(this.midi, msg.track, msg.options);
        this.port.postMessage({ type: "trackOptionsSet", success: result === 0, track: msg.track, reqId: msg.reqId });
        break;
      }
      case "setChannelEnabled": {
        const result = this.adl._adl_setChannelEnabled(this.midi, msg.channel, msg.enabled ? 1 : 0);
        this.port.postMessage({ type: "channelEnabledSet", success: result === 0, channel: msg.channel, reqId: msg.reqId });
        break;
      }
      case "setTempo":
        this.adl._adl_setTempo(this.midi, msg.tempo);
        break;
      case "getState":
        this.port.postMessage({
          type: "state",
          position: this.adl._adl_positionTell(this.midi),
          duration: this.adl._adl_totalTimeLength(this.midi),
          atEnd: this.adl._adl_atEnd(this.midi) !== 0,
          playMode: this.playMode
        });
        break;
      case "reset":
        this.adl._adl_reset(this.midi);
        this.playMode = "realtime";
        break;
      // ================== Bank Management ==================
      case "reserveBanks": {
        const result = this.adl._adl_reserveBanks(this.midi, msg.count);
        this.port.postMessage({ type: "banksReserved", success: result >= 0, reqId: msg.reqId });
        break;
      }
      case "getBankId": {
        const bankIdPtr = this.adl._malloc(_AdlMidiProcessor.SIZEOF_ADL_BANK_ID);
        this.adl.HEAPU8[bankIdPtr] = msg.bankId.percussive ? 1 : 0;
        this.adl.HEAPU8[bankIdPtr + 1] = msg.bankId.msb || 0;
        this.adl.HEAPU8[bankIdPtr + 2] = msg.bankId.lsb || 0;
        const bankPtr = this.adl._malloc(_AdlMidiProcessor.SIZEOF_ADL_BANK);
        const bankResult = this.adl._adl_getBank(this.midi, bankIdPtr, 0, bankPtr);
        let id = null;
        if (bankResult === 0) {
          const outIdPtr = this.adl._malloc(_AdlMidiProcessor.SIZEOF_ADL_BANK_ID);
          const idResult = this.adl._adl_getBankId(this.midi, bankPtr, outIdPtr);
          if (idResult === 0) {
            id = {
              percussive: this.adl.HEAPU8[outIdPtr],
              msb: this.adl.HEAPU8[outIdPtr + 1],
              lsb: this.adl.HEAPU8[outIdPtr + 2]
            };
          }
          this.adl._free(outIdPtr);
        }
        this.adl._free(bankIdPtr);
        this.adl._free(bankPtr);
        this.port.postMessage({ type: "bankId", id, bankId: msg.bankId, reqId: msg.reqId });
        break;
      }
      case "removeBank": {
        const bankIdPtr = this.adl._malloc(_AdlMidiProcessor.SIZEOF_ADL_BANK_ID);
        this.adl.HEAPU8[bankIdPtr] = msg.bankId.percussive ? 1 : 0;
        this.adl.HEAPU8[bankIdPtr + 1] = msg.bankId.msb || 0;
        this.adl.HEAPU8[bankIdPtr + 2] = msg.bankId.lsb || 0;
        const bankPtr = this.adl._malloc(_AdlMidiProcessor.SIZEOF_ADL_BANK);
        const bankResult = this.adl._adl_getBank(this.midi, bankIdPtr, 0, bankPtr);
        let success = false;
        if (bankResult === 0) {
          success = this.adl._adl_removeBank(this.midi, bankPtr) === 0;
        }
        this.adl._free(bankIdPtr);
        this.adl._free(bankPtr);
        this.port.postMessage({ type: "bankRemoved", success, bankId: msg.bankId, reqId: msg.reqId });
        break;
      }
      case "loadEmbeddedBank": {
        const bankIdPtr = this.adl._malloc(_AdlMidiProcessor.SIZEOF_ADL_BANK_ID);
        this.adl.HEAPU8[bankIdPtr] = msg.bankId.percussive ? 1 : 0;
        this.adl.HEAPU8[bankIdPtr + 1] = msg.bankId.msb || 0;
        this.adl.HEAPU8[bankIdPtr + 2] = msg.bankId.lsb || 0;
        const bankPtr = this.adl._malloc(_AdlMidiProcessor.SIZEOF_ADL_BANK);
        const existed = this.adl._adl_getBank(this.midi, bankIdPtr, 0, bankPtr) === 0;
        const bankResult = existed ? 0 : this.adl._adl_getBank(this.midi, bankIdPtr, 1, bankPtr);
        let success = false;
        if (bankResult === 0) {
          success = this.adl._adl_loadEmbeddedBank(this.midi, bankPtr, msg.num) === 0;
          if (!success && !existed) {
            this.adl._adl_removeBank(this.midi, bankPtr);
          }
        }
        this.adl._free(bankIdPtr);
        this.adl._free(bankPtr);
        this.port.postMessage({ type: "embeddedBankLoaded", success, bankId: msg.bankId, reqId: msg.reqId });
        break;
      }
      // ================== SysEx ==================
      case "systemExclusive": {
        const bytes = new Uint8Array(msg.data);
        const ptr = this.adl._malloc(bytes.length);
        this.adl.HEAPU8.set(bytes, ptr);
        const result = this.adl._adl_rt_systemExclusive(this.midi, ptr, bytes.length);
        this.adl._free(ptr);
        this.port.postMessage({ type: "systemExclusiveSent", success: result !== 0, reqId: msg.reqId });
        break;
      }
      // ================== Raw OPL3 ==================
      case "rawOPL3":
        this.adl._adl_rt_rawOPL3(this.midi, msg.chipId, msg.reg, msg.value);
        break;
      case "reserveChipChannels": {
        const result = this.adl._adl_reserveChipChannels(this.midi, msg.chipId, msg.channelMask);
        this.port.postMessage({ type: "chipChannelsReserved", success: result === 0, chipId: msg.chipId, reqId: msg.reqId });
        break;
      }
      case "getReservedChipChannels": {
        const mask = this.adl._adl_getReservedChipChannels(this.midi, msg.chipId);
        this.port.postMessage({ type: "reservedChipChannels", mask, chipId: msg.chipId, reqId: msg.reqId });
        break;
      }
      // ================== Debug / Diagnostics ==================
      case "describeChannels": {
        const numChips = this.adl._adl_getNumChipsObtained(this.midi);
        const size = Math.max(256, (numChips + 1) * 23);
        const textPtr = this.adl._malloc(size);
        const attrPtr = this.adl._malloc(size);
        this.adl._adl_describeChannels(this.midi, textPtr, attrPtr, size);
        const text = this.adl.UTF8ToString(textPtr);
        const attr = Array.from(this.adl.HEAPU8.slice(attrPtr, attrPtr + text.length));
        this.adl._free(textPtr);
        this.adl._free(attrPtr);
        this.port.postMessage({ type: "channelsDescribed", text, attr, reqId: msg.reqId });
        break;
      }
    }
  }
  loadMidiData(arrayBuffer) {
    try {
      const data = new Uint8Array(arrayBuffer);
      const dataPtr = this.adl._malloc(data.length);
      this.adl.HEAPU8.set(data, dataPtr);
      const result = this.adl._adl_openData(this.midi, dataPtr, data.length);
      this.adl._free(dataPtr);
      if (result === 0) {
        const duration = this.adl._adl_totalTimeLength(this.midi);
        this.port.postMessage({
          type: "midiLoaded",
          success: true,
          duration
        });
      } else {
        this.port.postMessage({
          type: "midiLoaded",
          success: false,
          error: "Failed to parse MIDI data"
        });
      }
    } catch (error) {
      this.port.postMessage({
        type: "midiLoaded",
        success: false,
        error: error.message
      });
    }
  }
  /**
   * Get list of embedded banks with their names
   * @returns {{id: number, name: string}[]}
   */
  getEmbeddedBankList() {
    const count = this.adl._adl_getBanksCount();
    const namesPtr = this.adl._adl_getBankNames();
    const banks = [];
    for (let i = 0; i < count; i++) {
      const strPtr = this.adl.getValue(namesPtr + i * 4, "i32");
      const name = strPtr ? this.adl.UTF8ToString(strPtr) : `Bank ${i}`;
      banks.push({ id: i, name });
    }
    return banks;
  }
  loadBankData(arrayBuffer) {
    try {
      const data = new Uint8Array(arrayBuffer);
      const dataPtr = this.adl._malloc(data.length);
      this.adl.HEAPU8.set(data, dataPtr);
      const result = this.adl._adl_openBankData(this.midi, dataPtr, data.length);
      this.adl._free(dataPtr);
      if (result === 0) {
        this.port.postMessage({ type: "bankLoaded", success: true });
      } else {
        this.port.postMessage({
          type: "bankLoaded",
          success: false,
          error: "Failed to load bank data"
        });
      }
    } catch (error) {
      this.port.postMessage({
        type: "bankLoaded",
        success: false,
        error: error.message
      });
    }
  }
  process(_inputs, outputs, _parameters) {
    if (!this.ready || !this.midi || !this.adl || !this.adl.HEAP16) return true;
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const left = output[0];
    const right = output[1] || output[0];
    const frames = left.length;
    try {
      const sampleCount = frames * 2;
      if (this.playMode === "file") {
        this.adl._adl_play(this.midi, sampleCount, this.bufferPtr);
        if (this.adl._adl_atEnd(this.midi) !== 0) {
          this.adl._adl_panic(this.midi);
          this.playMode = "realtime";
          this.port.postMessage({ type: "playbackEnded" });
        }
      } else {
        this.adl._adl_generate(this.midi, sampleCount, this.bufferPtr);
      }
      const currentBuffer = this.adl.HEAP16.buffer;
      if (this.cachedHeapBuffer !== currentBuffer) {
        this.cachedHeapBuffer = currentBuffer;
      }
      const heap16 = new Int16Array(currentBuffer, this.bufferPtr, sampleCount);
      for (let i = 0; i < frames; i++) {
        left[i] = heap16[i * 2] / 32768;
        right[i] = heap16[i * 2 + 1] / 32768;
      }
    } catch (e) {
      this.port.postMessage({ type: "processingError", error: e.message || String(e) });
    }
    return true;
  }
};
// ================== Instrument Editing API ==================
// Structure sizes (imported from shared utils)
__publicField(_AdlMidiProcessor, "SIZEOF_ADL_OPERATOR", SIZEOF_ADL_OPERATOR);
__publicField(_AdlMidiProcessor, "SIZEOF_ADL_INSTRUMENT", SIZEOF_ADL_INSTRUMENT);
__publicField(_AdlMidiProcessor, "SIZEOF_ADL_BANK", SIZEOF_ADL_BANK);
__publicField(_AdlMidiProcessor, "SIZEOF_ADL_BANK_ID", SIZEOF_ADL_BANK_ID);
var AdlMidiProcessor = _AdlMidiProcessor;
registerProcessor("adl-midi-processor", AdlMidiProcessor);
