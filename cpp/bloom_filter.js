
var createModule = (() => {
  var _scriptName = typeof document != 'undefined' ? document.currentScript?.src : undefined;
  
  return (
function(moduleArg = {}) {
  var moduleRtn;

// include: shell.js
// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(moduleArg) => Promise<Module>
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = moduleArg;

// Set up the promise that indicates the Module is initialized
var readyPromiseResolve, readyPromiseReject;

var readyPromise = new Promise((resolve, reject) => {
  readyPromiseResolve = resolve;
  readyPromiseReject = reject;
});

// Determine the runtime environment we are in. You can customize this by
// setting the ENVIRONMENT setting at compile time (see settings.js).
// Attempt to auto-detect the environment
var ENVIRONMENT_IS_WEB = typeof window == "object";

var ENVIRONMENT_IS_WORKER = typeof importScripts == "function";

// N.b. Electron.js environment is simultaneously a NODE-environment, but
// also a web environment.
var ENVIRONMENT_IS_NODE = typeof process == "object" && typeof process.versions == "object" && typeof process.versions.node == "string";

var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)
// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = Object.assign({}, Module);

var arguments_ = [];

var thisProgram = "./this.program";

var quit_ = (status, toThrow) => {
  throw toThrow;
};

// `/` should be present at the end if `scriptDirectory` is not empty
var scriptDirectory = "";

function locateFile(path) {
  if (Module["locateFile"]) {
    return Module["locateFile"](path, scriptDirectory);
  }
  return scriptDirectory + path;
}

// Hooks that are implemented differently in different runtime environments.
var readAsync, readBinary;

// Note that this includes Node.js workers when relevant (pthreads is enabled).
// Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
// ENVIRONMENT_IS_NODE.
if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  if (ENVIRONMENT_IS_WORKER) {
    // Check worker, not web, since window could be polyfilled
    scriptDirectory = self.location.href;
  } else if (typeof document != "undefined" && document.currentScript) {
    // web
    scriptDirectory = document.currentScript.src;
  }
  // When MODULARIZE, this JS may be executed later, after document.currentScript
  // is gone, so we saved it, and we use it here instead of any other info.
  if (_scriptName) {
    scriptDirectory = _scriptName;
  }
  // blob urls look like blob:http://site.com/etc/etc and we cannot infer anything from them.
  // otherwise, slice off the final part of the url to find the script directory.
  // if scriptDirectory does not contain a slash, lastIndexOf will return -1,
  // and scriptDirectory will correctly be replaced with an empty string.
  // If scriptDirectory contains a query (starting with ?) or a fragment (starting with #),
  // they are removed because they could contain a slash.
  if (scriptDirectory.startsWith("blob:")) {
    scriptDirectory = "";
  } else {
    scriptDirectory = scriptDirectory.substr(0, scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1);
  }
  {
    // include: web_or_worker_shell_read.js
    if (ENVIRONMENT_IS_WORKER) {
      readBinary = url => {
        var xhr = new XMLHttpRequest;
        xhr.open("GET", url, false);
        xhr.responseType = "arraybuffer";
        xhr.send(null);
        return new Uint8Array(/** @type{!ArrayBuffer} */ (xhr.response));
      };
    }
    readAsync = url => fetch(url, {
      credentials: "same-origin"
    }).then(response => {
      if (response.ok) {
        return response.arrayBuffer();
      }
      return Promise.reject(new Error(response.status + " : " + response.url));
    });
  }
} else // end include: web_or_worker_shell_read.js
{}

var out = Module["print"] || console.log.bind(console);

var err = Module["printErr"] || console.error.bind(console);

// Merge back in the overrides
Object.assign(Module, moduleOverrides);

// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used.
moduleOverrides = null;

// Emit code to handle expected values on the Module object. This applies Module.x
// to the proper local x. This has two benefits: first, we only emit it if it is
// expected to arrive, and second, by using a local everywhere else that can be
// minified.
if (Module["arguments"]) arguments_ = Module["arguments"];

if (Module["thisProgram"]) thisProgram = Module["thisProgram"];

if (Module["quit"]) quit_ = Module["quit"];

// perform assertions in shell.js after we set up out() and err(), as otherwise if an assertion fails it cannot print the message
// end include: shell.js
// include: preamble.js
// === Preamble library stuff ===
// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html
var wasmBinary;

if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];

// Wasm globals
var wasmMemory;

//========================================
// Runtime essentials
//========================================
// whether we are quitting the application. no code should run after this.
// set in exit() and abort()
var ABORT = false;

// set by exit() and abort().  Passed to 'onExit' handler.
// NOTE: This is also used as the process return code code in shell environments
// but only when noExitRuntime is false.
var EXITSTATUS;

// In STRICT mode, we only define assert() when ASSERTIONS is set.  i.e. we
// don't define it at all in release modes.  This matches the behaviour of
// MINIMAL_RUNTIME.
// TODO(sbc): Make this the default even without STRICT enabled.
/** @type {function(*, string=)} */ function assert(condition, text) {
  if (!condition) {
    // This build was created without ASSERTIONS defined.  `assert()` should not
    // ever be called in this configuration but in case there are callers in
    // the wild leave this simple abort() implementation here for now.
    abort(text);
  }
}

// Memory management
var HEAP, /** @type {!Int8Array} */ HEAP8, /** @type {!Uint8Array} */ HEAPU8, /** @type {!Int16Array} */ HEAP16, /** @type {!Uint16Array} */ HEAPU16, /** @type {!Int32Array} */ HEAP32, /** @type {!Uint32Array} */ HEAPU32, /** @type {!Float32Array} */ HEAPF32, /** @type {!Float64Array} */ HEAPF64;

// include: runtime_shared.js
function updateMemoryViews() {
  var b = wasmMemory.buffer;
  Module["HEAP8"] = HEAP8 = new Int8Array(b);
  Module["HEAP16"] = HEAP16 = new Int16Array(b);
  Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
  Module["HEAPU16"] = HEAPU16 = new Uint16Array(b);
  Module["HEAP32"] = HEAP32 = new Int32Array(b);
  Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
  Module["HEAPF32"] = HEAPF32 = new Float32Array(b);
  Module["HEAPF64"] = HEAPF64 = new Float64Array(b);
}

// end include: runtime_shared.js
// include: runtime_stack_check.js
// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  var max = _emscripten_stack_get_end();
  // If the stack ends at address zero we write our cookies 4 bytes into the
  // stack.  This prevents interference with SAFE_HEAP and ASAN which also
  // monitor writes to address zero.
  if (max == 0) {
    max += 4;
  }
  // The stack grow downwards towards _emscripten_stack_get_end.
  // We write cookies to the final two words in the stack and detect if they are
  // ever overwritten.
  HEAPU32[((max) >>> 2) >>> 0] = 34821223;
  HEAPU32[(((max) + (4)) >>> 2) >>> 0] = 2310721022;
  // Also test the global address 0 for integrity.
  HEAPU32[((0) >>> 2) >>> 0] = 1668509029;
}

function checkStackCookie() {
  if (ABORT) return;
  var max = _emscripten_stack_get_end();
  // See writeStackCookie().
  if (max == 0) {
    max += 4;
  }
  var cookie1 = HEAPU32[((max) >>> 2) >>> 0];
  var cookie2 = HEAPU32[(((max) + (4)) >>> 2) >>> 0];
  if (cookie1 != 34821223 || cookie2 != 2310721022) {
    abort(`Stack overflow! Stack cookie has been overwritten at ${ptrToString(max)}, expected hex dwords 0x89BACDFE and 0x2135467, but received ${ptrToString(cookie2)} ${ptrToString(cookie1)}`);
  }
  // Also test the global address 0 for integrity.
  if (HEAPU32[((0) >>> 2) >>> 0] != 1668509029) /* 'emsc' */ {
    abort("Runtime error: The application has corrupted its heap memory area (address zero)!");
  }
}

// end include: runtime_stack_check.js
// include: runtime_assertions.js
// end include: runtime_assertions.js
var __ATPRERUN__ = [];

// functions called before the runtime is initialized
var __ATINIT__ = [];

// functions called during startup
var __ATEXIT__ = [];

// functions called during shutdown
var __ATPOSTRUN__ = [];

// functions called after the main() is called
var runtimeInitialized = false;

function preRun() {
  if (Module["preRun"]) {
    if (typeof Module["preRun"] == "function") Module["preRun"] = [ Module["preRun"] ];
    while (Module["preRun"].length) {
      addOnPreRun(Module["preRun"].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function initRuntime() {
  runtimeInitialized = true;
  checkStackCookie();
  setStackLimits();
  callRuntimeCallbacks(__ATINIT__);
}

function postRun() {
  checkStackCookie();
  if (Module["postRun"]) {
    if (typeof Module["postRun"] == "function") Module["postRun"] = [ Module["postRun"] ];
    while (Module["postRun"].length) {
      addOnPostRun(Module["postRun"].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}

function addOnExit(cb) {}

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}

// include: runtime_math.js
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/fround
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/trunc
// end include: runtime_math.js
// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// Module.preRun (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;

var runDependencyWatcher = null;

var dependenciesFulfilled = null;

// overridden to take different actions when all run dependencies are fulfilled
function getUniqueRunDependency(id) {
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  Module["monitorRunDependencies"]?.(runDependencies);
}

function removeRunDependency(id) {
  runDependencies--;
  Module["monitorRunDependencies"]?.(runDependencies);
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback();
    }
  }
}

/** @param {string|number=} what */ function abort(what) {
  Module["onAbort"]?.(what);
  what = "Aborted(" + what + ")";
  // TODO(sbc): Should we remove printing and leave it up to whoever
  // catches the exception?
  err(what);
  ABORT = true;
  EXITSTATUS = 1;
  what += ". Build with -sASSERTIONS for more info.";
  // Use a wasm runtime error, because a JS error might be seen as a foreign
  // exception, which means we'd run destructors on it. We need the error to
  // simply make the program stop.
  // FIXME This approach does not work in Wasm EH because it currently does not assume
  // all RuntimeErrors are from traps; it decides whether a RuntimeError is from
  // a trap or not based on a hidden field within the object. So at the moment
  // we don't have a way of throwing a wasm trap from JS. TODO Make a JS API that
  // allows this in the wasm spec.
  // Suppress closure compiler warning here. Closure compiler's builtin extern
  // definition for WebAssembly.RuntimeError claims it takes no arguments even
  // though it can.
  // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure gets fixed.
  /** @suppress {checkTypes} */ var e = new WebAssembly.RuntimeError(what);
  readyPromiseReject(e);
  // Throw the error whether or not MODULARIZE is set because abort is used
  // in code paths apart from instantiation where an exception is expected
  // to be thrown when abort is called.
  throw e;
}

// include: memoryprofiler.js
// end include: memoryprofiler.js
// include: URIUtils.js
// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = "data:application/octet-stream;base64,";

/**
 * Indicates whether filename is a base64 data URI.
 * @noinline
 */ var isDataURI = filename => filename.startsWith(dataURIPrefix);

/**
 * Indicates whether filename is delivered via file protocol (as opposed to http/https)
 * @noinline
 */ var isFileURI = filename => filename.startsWith("file://");

// end include: URIUtils.js
// include: runtime_exceptions.js
// end include: runtime_exceptions.js
function findWasmBinary() {
  var f = "bloom_filter.wasm";
  if (!isDataURI(f)) {
    return locateFile(f);
  }
  return f;
}

var wasmBinaryFile;

function getBinarySync(file) {
  if (file == wasmBinaryFile && wasmBinary) {
    return new Uint8Array(wasmBinary);
  }
  if (readBinary) {
    return readBinary(file);
  }
  throw "both async and sync fetching of the wasm failed";
}

function getBinaryPromise(binaryFile) {
  // If we don't have the binary yet, load it asynchronously using readAsync.
  if (!wasmBinary) {
    // Fetch the binary using readAsync
    return readAsync(binaryFile).then(response => new Uint8Array(/** @type{!ArrayBuffer} */ (response)), // Fall back to getBinarySync if readAsync fails
    () => getBinarySync(binaryFile));
  }
  // Otherwise, getBinarySync should be able to get it synchronously
  return Promise.resolve().then(() => getBinarySync(binaryFile));
}

function instantiateArrayBuffer(binaryFile, imports, receiver) {
  return getBinaryPromise(binaryFile).then(binary => WebAssembly.instantiate(binary, imports)).then(receiver, reason => {
    err(`failed to asynchronously prepare wasm: ${reason}`);
    abort(reason);
  });
}

function instantiateAsync(binary, binaryFile, imports, callback) {
  if (!binary && typeof WebAssembly.instantiateStreaming == "function" && !isDataURI(binaryFile) && typeof fetch == "function") {
    return fetch(binaryFile, {
      credentials: "same-origin"
    }).then(response => {
      // Suppress closure warning here since the upstream definition for
      // instantiateStreaming only allows Promise<Repsponse> rather than
      // an actual Response.
      // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure is fixed.
      /** @suppress {checkTypes} */ var result = WebAssembly.instantiateStreaming(response, imports);
      return result.then(callback, function(reason) {
        // We expect the most common failure cause to be a bad MIME type for the binary,
        // in which case falling back to ArrayBuffer instantiation should work.
        err(`wasm streaming compile failed: ${reason}`);
        err("falling back to ArrayBuffer instantiation");
        return instantiateArrayBuffer(binaryFile, imports, callback);
      });
    });
  }
  return instantiateArrayBuffer(binaryFile, imports, callback);
}

function getWasmImports() {
  // prepare imports
  return {
    "env": wasmImports,
    "wasi_snapshot_preview1": wasmImports
  };
}

// Create the wasm instance.
// Receives the wasm imports, returns the exports.
function createWasm() {
  var info = getWasmImports();
  // Load the wasm module and create an instance of using native support in the JS engine.
  // handle a generated wasm instance, receiving its exports and
  // performing other necessary setup
  /** @param {WebAssembly.Module=} module*/ function receiveInstance(instance, module) {
    wasmExports = instance.exports;
    wasmExports = applySignatureConversions(wasmExports);
    wasmMemory = wasmExports["memory"];
    updateMemoryViews();
    wasmTable = wasmExports["__indirect_function_table"];
    addOnInit(wasmExports["__wasm_call_ctors"]);
    removeRunDependency("wasm-instantiate");
    return wasmExports;
  }
  // wait for the pthread pool (if any)
  addRunDependency("wasm-instantiate");
  // Prefer streaming instantiation if available.
  function receiveInstantiationResult(result) {
    // 'result' is a ResultObject object which has both the module and instance.
    // receiveInstance() will swap in the exports (to Module.asm) so they can be called
    // TODO: Due to Closure regression https://github.com/google/closure-compiler/issues/3193, the above line no longer optimizes out down to the following line.
    // When the regression is fixed, can restore the above PTHREADS-enabled path.
    receiveInstance(result["instance"]);
  }
  // User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
  // to manually instantiate the Wasm module themselves. This allows pages to
  // run the instantiation parallel to any other async startup actions they are
  // performing.
  // Also pthreads and wasm workers initialize the wasm instance through this
  // path.
  if (Module["instantiateWasm"]) {
    try {
      return Module["instantiateWasm"](info, receiveInstance);
    } catch (e) {
      err(`Module.instantiateWasm callback failed with error: ${e}`);
      // If instantiation fails, reject the module ready promise.
      readyPromiseReject(e);
    }
  }
  if (!wasmBinaryFile) wasmBinaryFile = findWasmBinary();
  // If instantiation fails, reject the module ready promise.
  instantiateAsync(wasmBinary, wasmBinaryFile, info, receiveInstantiationResult).catch(readyPromiseReject);
  return {};
}

// Globals used by JS i64 conversions (see makeSetValue)
var tempDouble;

var tempI64;

// include: runtime_debug.js
// end include: runtime_debug.js
// === Body ===
// end include: preamble.js
/** @constructor */ function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = `Program terminated with exit(${status})`;
  this.status = status;
}

var callRuntimeCallbacks = callbacks => {
  while (callbacks.length > 0) {
    // Pass the module as the first argument.
    callbacks.shift()(Module);
  }
};

/**
     * @param {number} ptr
     * @param {string} type
     */ function getValue(ptr, type = "i8") {
  if (type.endsWith("*")) type = "*";
  switch (type) {
   case "i1":
    return HEAP8[ptr >>> 0];

   case "i8":
    return HEAP8[ptr >>> 0];

   case "i16":
    return HEAP16[((ptr) >>> 1) >>> 0];

   case "i32":
    return HEAP32[((ptr) >>> 2) >>> 0];

   case "i64":
    abort("to do getValue(i64) use WASM_BIGINT");

   case "float":
    return HEAPF32[((ptr) >>> 2) >>> 0];

   case "double":
    return HEAPF64[((ptr) >>> 3) >>> 0];

   case "*":
    return HEAPU32[((ptr) >>> 2) >>> 0];

   default:
    abort(`invalid type for getValue: ${type}`);
  }
}

var noExitRuntime = Module["noExitRuntime"] || true;

var ptrToString = ptr => "0x" + ptr.toString(16).padStart(8, "0");

var setStackLimits = () => {
  var stackLow = _emscripten_stack_get_base();
  var stackHigh = _emscripten_stack_get_end();
  ___set_stack_limits(stackLow, stackHigh);
};

/**
     * @param {number} ptr
     * @param {number} value
     * @param {string} type
     */ function setValue(ptr, value, type = "i8") {
  if (type.endsWith("*")) type = "*";
  switch (type) {
   case "i1":
    HEAP8[ptr >>> 0] = value;
    break;

   case "i8":
    HEAP8[ptr >>> 0] = value;
    break;

   case "i16":
    HEAP16[((ptr) >>> 1) >>> 0] = value;
    break;

   case "i32":
    HEAP32[((ptr) >>> 2) >>> 0] = value;
    break;

   case "i64":
    abort("to do setValue(i64) use WASM_BIGINT");

   case "float":
    HEAPF32[((ptr) >>> 2) >>> 0] = value;
    break;

   case "double":
    HEAPF64[((ptr) >>> 3) >>> 0] = value;
    break;

   case "*":
    HEAPU32[((ptr) >>> 2) >>> 0] = value;
    break;

   default:
    abort(`invalid type for setValue: ${type}`);
  }
}

var stackRestore = val => __emscripten_stack_restore(val);

var stackSave = () => _emscripten_stack_get_current();

var exceptionCaught = [];

var uncaughtExceptionCount = 0;

var convertI32PairToI53Checked = (lo, hi) => ((hi + 2097152) >>> 0 < 4194305 - !!lo) ? (lo >>> 0) + hi * 4294967296 : NaN;

function ___cxa_begin_catch(ptr) {
  ptr >>>= 0;
  var info = new ExceptionInfo(ptr);
  if (!info.get_caught()) {
    info.set_caught(true);
    uncaughtExceptionCount--;
  }
  info.set_rethrown(false);
  exceptionCaught.push(info);
  ___cxa_increment_exception_refcount(info.excPtr);
  return info.get_exception_ptr();
}

var exceptionLast = 0;

var ___cxa_end_catch = () => {
  // Clear state flag.
  _setThrew(0, 0);
  // Call destructor if one is registered then clear it.
  var info = exceptionCaught.pop();
  ___cxa_decrement_exception_refcount(info.excPtr);
  exceptionLast = 0;
};

// XXX in decRef?
class ExceptionInfo {
  // excPtr - Thrown object pointer to wrap. Metadata pointer is calculated from it.
  constructor(excPtr) {
    this.excPtr = excPtr;
    this.ptr = excPtr - 24;
  }
  set_type(type) {
    HEAPU32[(((this.ptr) + (4)) >>> 2) >>> 0] = type;
  }
  get_type() {
    return HEAPU32[(((this.ptr) + (4)) >>> 2) >>> 0];
  }
  set_destructor(destructor) {
    HEAPU32[(((this.ptr) + (8)) >>> 2) >>> 0] = destructor;
  }
  get_destructor() {
    return HEAPU32[(((this.ptr) + (8)) >>> 2) >>> 0];
  }
  set_caught(caught) {
    caught = caught ? 1 : 0;
    HEAP8[(this.ptr) + (12) >>> 0] = caught;
  }
  get_caught() {
    return HEAP8[(this.ptr) + (12) >>> 0] != 0;
  }
  set_rethrown(rethrown) {
    rethrown = rethrown ? 1 : 0;
    HEAP8[(this.ptr) + (13) >>> 0] = rethrown;
  }
  get_rethrown() {
    return HEAP8[(this.ptr) + (13) >>> 0] != 0;
  }
  // Initialize native structure fields. Should be called once after allocated.
  init(type, destructor) {
    this.set_adjusted_ptr(0);
    this.set_type(type);
    this.set_destructor(destructor);
  }
  set_adjusted_ptr(adjustedPtr) {
    HEAPU32[(((this.ptr) + (16)) >>> 2) >>> 0] = adjustedPtr;
  }
  get_adjusted_ptr() {
    return HEAPU32[(((this.ptr) + (16)) >>> 2) >>> 0];
  }
  // Get pointer which is expected to be received by catch clause in C++ code. It may be adjusted
  // when the pointer is casted to some of the exception object base classes (e.g. when virtual
  // inheritance is used). When a pointer is thrown this method should return the thrown pointer
  // itself.
  get_exception_ptr() {
    // Work around a fastcomp bug, this code is still included for some reason in a build without
    // exceptions support.
    var isPointer = ___cxa_is_pointer_type(this.get_type());
    if (isPointer) {
      return HEAPU32[((this.excPtr) >>> 2) >>> 0];
    }
    var adjusted = this.get_adjusted_ptr();
    if (adjusted !== 0) return adjusted;
    return this.excPtr;
  }
}

function ___resumeException(ptr) {
  ptr >>>= 0;
  if (!exceptionLast) {
    exceptionLast = ptr;
  }
  throw exceptionLast;
}

var setTempRet0 = val => __emscripten_tempret_set(val);

var findMatchingCatch = args => {
  var thrown = exceptionLast;
  if (!thrown) {
    // just pass through the null ptr
    setTempRet0(0);
    return 0;
  }
  var info = new ExceptionInfo(thrown);
  info.set_adjusted_ptr(thrown);
  var thrownType = info.get_type();
  if (!thrownType) {
    // just pass through the thrown ptr
    setTempRet0(0);
    return thrown;
  }
  // can_catch receives a **, add indirection
  // The different catch blocks are denoted by different types.
  // Due to inheritance, those types may not precisely match the
  // type of the thrown object. Find one which matches, and
  // return the type of the catch block which should be called.
  for (var caughtType of args) {
    if (caughtType === 0 || caughtType === thrownType) {
      // Catch all clause matched or exactly the same type is caught
      break;
    }
    var adjusted_ptr_addr = info.ptr + 16;
    if (___cxa_can_catch(caughtType, thrownType, adjusted_ptr_addr)) {
      setTempRet0(caughtType);
      return thrown;
    }
  }
  setTempRet0(thrownType);
  return thrown;
};

function ___cxa_find_matching_catch_2() {
  return findMatchingCatch([]);
}

function ___cxa_find_matching_catch_3(arg0) {
  arg0 >>>= 0;
  return findMatchingCatch([ arg0 ]);
}

function ___cxa_throw(ptr, type, destructor) {
  ptr >>>= 0;
  type >>>= 0;
  destructor >>>= 0;
  var info = new ExceptionInfo(ptr);
  // Initialize ExceptionInfo content after it was allocated in __cxa_allocate_exception.
  info.init(type, destructor);
  exceptionLast = ptr;
  uncaughtExceptionCount++;
  throw exceptionLast;
}

function ___handle_stack_overflow(requested) {
  requested >>>= 0;
  var base = _emscripten_stack_get_base();
  var end = _emscripten_stack_get_end();
  abort(`stack overflow (Attempt to set SP to ${ptrToString(requested)}` + `, with stack limits [${ptrToString(end)} - ${ptrToString(base)}` + "]). If you require more stack space build with -sSTACK_SIZE=<bytes>");
}

var __abort_js = () => {
  abort("");
};

var nowIsMonotonic = 1;

var __emscripten_get_now_is_monotonic = () => nowIsMonotonic;

function __emscripten_memcpy_js(dest, src, num) {
  dest >>>= 0;
  src >>>= 0;
  num >>>= 0;
  return HEAPU8.copyWithin(dest >>> 0, src >>> 0, src + num >>> 0);
}

var _emscripten_date_now = () => Date.now();

var _emscripten_get_now;

// Modern environment where performance.now() is supported:
// N.B. a shorter form "_emscripten_get_now = performance.now;" is
// unfortunately not allowed even in current browsers (e.g. FF Nightly 75).
_emscripten_get_now = () => performance.now();

var reallyNegative = x => x < 0 || (x === 0 && (1 / x) === -Infinity);

var convertI32PairToI53 = (lo, hi) => (lo >>> 0) + hi * 4294967296;

var convertU32PairToI53 = (lo, hi) => (lo >>> 0) + (hi >>> 0) * 4294967296;

var reSign = (value, bits) => {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits - 1)) : // abs is needed if bits == 32
  Math.pow(2, bits - 1);
  // for huge values, we can hit the precision limit and always get true here.
  // so don't do that but, in general there is no perfect solution here. With
  // 64-bit ints, we get rounding and errors
  // TODO: In i64 mode 1, resign the two parts separately and safely
  if (value >= half && (bits <= 32 || value > half)) {
    // Cannot bitshift half, as it may be at the limit of the bits JS uses in
    // bitshifts
    value = -2 * half + value;
  }
  return value;
};

var unSign = (value, bits) => {
  if (value >= 0) {
    return value;
  }
  // Need some trickery, since if bits == 32, we are right at the limit of the
  // bits JS uses in bitshifts
  return bits <= 32 ? 2 * Math.abs(1 << (bits - 1)) + value : Math.pow(2, bits) + value;
};

var strLen = ptr => {
  var end = ptr;
  while (HEAPU8[end >>> 0]) ++end;
  return end - ptr;
};

var lengthBytesUTF8 = str => {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
    // unit, not a Unicode code point of the character! So decode
    // UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var c = str.charCodeAt(i);
    // possibly a lead surrogate
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
  outIdx >>>= 0;
  // Parameter maxBytesToWrite is not optional. Negative values, 0, null,
  // undefined and false each don't write out any bytes.
  if (!(maxBytesToWrite > 0)) return 0;
  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1;
  // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
    // unit, not a Unicode code point of the character! So decode
    // UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description
    // and https://www.ietf.org/rfc/rfc2279.txt
    // and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i);
    // possibly a lead surrogate
    if (u >= 55296 && u <= 57343) {
      var u1 = str.charCodeAt(++i);
      u = 65536 + ((u & 1023) << 10) | (u1 & 1023);
    }
    if (u <= 127) {
      if (outIdx >= endIdx) break;
      heap[outIdx++ >>> 0] = u;
    } else if (u <= 2047) {
      if (outIdx + 1 >= endIdx) break;
      heap[outIdx++ >>> 0] = 192 | (u >> 6);
      heap[outIdx++ >>> 0] = 128 | (u & 63);
    } else if (u <= 65535) {
      if (outIdx + 2 >= endIdx) break;
      heap[outIdx++ >>> 0] = 224 | (u >> 12);
      heap[outIdx++ >>> 0] = 128 | ((u >> 6) & 63);
      heap[outIdx++ >>> 0] = 128 | (u & 63);
    } else {
      if (outIdx + 3 >= endIdx) break;
      heap[outIdx++ >>> 0] = 240 | (u >> 18);
      heap[outIdx++ >>> 0] = 128 | ((u >> 12) & 63);
      heap[outIdx++ >>> 0] = 128 | ((u >> 6) & 63);
      heap[outIdx++ >>> 0] = 128 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  heap[outIdx >>> 0] = 0;
  return outIdx - startIdx;
};

/** @type {function(string, boolean=, number=)} */ function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}

var formatString = (format, varargs) => {
  var textIndex = format;
  var argIndex = varargs;
  // This must be called before reading a double or i64 vararg. It will bump the pointer properly.
  // It also does an assert on i32 values, so it's nice to call it before all varargs calls.
  function prepVararg(ptr, type) {
    if (type === "double" || type === "i64") {
      // move so the load is aligned
      if (ptr & 7) {
        ptr += 4;
      }
    } else {}
    return ptr;
  }
  function getNextArg(type) {
    // NOTE: Explicitly ignoring type safety. Otherwise this fails:
    //       int x = 4; printf("%c\n", (char)x);
    var ret;
    argIndex = prepVararg(argIndex, type);
    if (type === "double") {
      ret = HEAPF64[((argIndex) >>> 3) >>> 0];
      argIndex += 8;
    } else if (type == "i64") {
      ret = [ HEAP32[((argIndex) >>> 2) >>> 0], HEAP32[(((argIndex) + (4)) >>> 2) >>> 0] ];
      argIndex += 8;
    } else {
      type = "i32";
      // varargs are always i32, i64, or double
      ret = HEAP32[((argIndex) >>> 2) >>> 0];
      argIndex += 4;
    }
    return ret;
  }
  var ret = [];
  var curr, next, currArg;
  while (1) {
    var startTextIndex = textIndex;
    curr = HEAP8[textIndex >>> 0];
    if (curr === 0) break;
    next = HEAP8[textIndex + 1 >>> 0];
    if (curr == 37) {
      // Handle flags.
      var flagAlwaysSigned = false;
      var flagLeftAlign = false;
      var flagAlternative = false;
      var flagZeroPad = false;
      var flagPadSign = false;
      flagsLoop: while (1) {
        switch (next) {
         case 43:
          flagAlwaysSigned = true;
          break;

         case 45:
          flagLeftAlign = true;
          break;

         case 35:
          flagAlternative = true;
          break;

         case 48:
          if (flagZeroPad) {
            break flagsLoop;
          } else {
            flagZeroPad = true;
            break;
          }

         case 32:
          flagPadSign = true;
          break;

         default:
          break flagsLoop;
        }
        textIndex++;
        next = HEAP8[textIndex + 1 >>> 0];
      }
      // Handle width.
      var width = 0;
      if (next == 42) {
        width = getNextArg("i32");
        textIndex++;
        next = HEAP8[textIndex + 1 >>> 0];
      } else {
        while (next >= 48 && next <= 57) {
          width = width * 10 + (next - 48);
          textIndex++;
          next = HEAP8[textIndex + 1 >>> 0];
        }
      }
      // Handle precision.
      var precisionSet = false, precision = -1;
      if (next == 46) {
        precision = 0;
        precisionSet = true;
        textIndex++;
        next = HEAP8[textIndex + 1 >>> 0];
        if (next == 42) {
          precision = getNextArg("i32");
          textIndex++;
        } else {
          while (1) {
            var precisionChr = HEAP8[textIndex + 1 >>> 0];
            if (precisionChr < 48 || precisionChr > 57) break;
            precision = precision * 10 + (precisionChr - 48);
            textIndex++;
          }
        }
        next = HEAP8[textIndex + 1 >>> 0];
      }
      if (precision < 0) {
        precision = 6;
        // Standard default.
        precisionSet = false;
      }
      // Handle integer sizes. WARNING: These assume a 32-bit architecture!
      var argSize;
      switch (String.fromCharCode(next)) {
       case "h":
        var nextNext = HEAP8[textIndex + 2 >>> 0];
        if (nextNext == 104) {
          textIndex++;
          argSize = 1;
        } else // char (actually i32 in varargs)
        {
          argSize = 2;
        }
        // short (actually i32 in varargs)
        break;

       case "l":
        var nextNext = HEAP8[textIndex + 2 >>> 0];
        if (nextNext == 108) {
          textIndex++;
          argSize = 8;
        } else // long long
        {
          argSize = 4;
        }
        // long
        break;

       case "L":
       // long long
        case "q":
       // int64_t
        case "j":
        // intmax_t
        argSize = 8;
        break;

       case "z":
       // size_t
        case "t":
       // ptrdiff_t
        case "I":
        // signed ptrdiff_t or unsigned size_t
        argSize = 4;
        break;

       default:
        argSize = null;
      }
      if (argSize) textIndex++;
      next = HEAP8[textIndex + 1 >>> 0];
      // Handle type specifier.
      switch (String.fromCharCode(next)) {
       case "d":
       case "i":
       case "u":
       case "o":
       case "x":
       case "X":
       case "p":
        {
          // Integer.
          var signed = next == 100 || next == 105;
          argSize = argSize || 4;
          currArg = getNextArg("i" + (argSize * 8));
          var argText;
          // Flatten i64-1 [low, high] into a (slightly rounded) double
          if (argSize == 8) {
            currArg = next == 117 ? convertU32PairToI53(currArg[0], currArg[1]) : convertI32PairToI53(currArg[0], currArg[1]);
          }
          // Truncate to requested size.
          if (argSize <= 4) {
            var limit = Math.pow(256, argSize) - 1;
            currArg = (signed ? reSign : unSign)(currArg & limit, argSize * 8);
          }
          // Format the number.
          var currAbsArg = Math.abs(currArg);
          var prefix = "";
          if (next == 100 || next == 105) {
            argText = reSign(currArg, 8 * argSize).toString(10);
          } else if (next == 117) {
            argText = unSign(currArg, 8 * argSize).toString(10);
            currArg = Math.abs(currArg);
          } else if (next == 111) {
            argText = (flagAlternative ? "0" : "") + currAbsArg.toString(8);
          } else if (next == 120 || next == 88) {
            prefix = (flagAlternative && currArg != 0) ? "0x" : "";
            if (currArg < 0) {
              // Represent negative numbers in hex as 2's complement.
              currArg = -currArg;
              argText = (currAbsArg - 1).toString(16);
              var buffer = [];
              for (var i = 0; i < argText.length; i++) {
                buffer.push((15 - parseInt(argText[i], 16)).toString(16));
              }
              argText = buffer.join("");
              while (argText.length < argSize * 2) argText = "f" + argText;
            } else {
              argText = currAbsArg.toString(16);
            }
            if (next == 88) {
              prefix = prefix.toUpperCase();
              argText = argText.toUpperCase();
            }
          } else if (next == 112) {
            if (currAbsArg === 0) {
              argText = "(nil)";
            } else {
              prefix = "0x";
              argText = currAbsArg.toString(16);
            }
          }
          if (precisionSet) {
            while (argText.length < precision) {
              argText = "0" + argText;
            }
          }
          // Add sign if needed
          if (currArg >= 0) {
            if (flagAlwaysSigned) {
              prefix = "+" + prefix;
            } else if (flagPadSign) {
              prefix = " " + prefix;
            }
          }
          // Move sign to prefix so we zero-pad after the sign
          if (argText.charAt(0) == "-") {
            prefix = "-" + prefix;
            argText = argText.substr(1);
          }
          // Add padding.
          while (prefix.length + argText.length < width) {
            if (flagLeftAlign) {
              argText += " ";
            } else {
              if (flagZeroPad) {
                argText = "0" + argText;
              } else {
                prefix = " " + prefix;
              }
            }
          }
          // Insert the result into the buffer.
          argText = prefix + argText;
          argText.split("").forEach(function(chr) {
            ret.push(chr.charCodeAt(0));
          });
          break;
        }

       case "f":
       case "F":
       case "e":
       case "E":
       case "g":
       case "G":
        {
          // Float.
          currArg = getNextArg("double");
          var argText;
          if (isNaN(currArg)) {
            argText = "nan";
            flagZeroPad = false;
          } else if (!isFinite(currArg)) {
            argText = (currArg < 0 ? "-" : "") + "inf";
            flagZeroPad = false;
          } else {
            var isGeneral = false;
            var effectivePrecision = Math.min(precision, 20);
            // Convert g/G to f/F or e/E, as per:
            // http://pubs.opengroup.org/onlinepubs/9699919799/functions/printf.html
            if (next == 103 || next == 71) {
              isGeneral = true;
              precision = precision || 1;
              var exponent = parseInt(currArg.toExponential(effectivePrecision).split("e")[1], 10);
              if (precision > exponent && exponent >= -4) {
                next = ((next == 103) ? "f" : "F").charCodeAt(0);
                precision -= exponent + 1;
              } else {
                next = ((next == 103) ? "e" : "E").charCodeAt(0);
                precision--;
              }
              effectivePrecision = Math.min(precision, 20);
            }
            if (next == 101 || next == 69) {
              argText = currArg.toExponential(effectivePrecision);
              // Make sure the exponent has at least 2 digits.
              if (/[eE][-+]\d$/.test(argText)) {
                argText = argText.slice(0, -1) + "0" + argText.slice(-1);
              }
            } else if (next == 102 || next == 70) {
              argText = currArg.toFixed(effectivePrecision);
              if (currArg === 0 && reallyNegative(currArg)) {
                argText = "-" + argText;
              }
            }
            var parts = argText.split("e");
            if (isGeneral && !flagAlternative) {
              // Discard trailing zeros and periods.
              while (parts[0].length > 1 && parts[0].includes(".") && (parts[0].slice(-1) == "0" || parts[0].slice(-1) == ".")) {
                parts[0] = parts[0].slice(0, -1);
              }
            } else {
              // Make sure we have a period in alternative mode.
              if (flagAlternative && argText.indexOf(".") == -1) parts[0] += ".";
              // Zero pad until required precision.
              while (precision > effectivePrecision++) parts[0] += "0";
            }
            argText = parts[0] + (parts.length > 1 ? "e" + parts[1] : "");
            // Capitalize 'E' if needed.
            if (next == 69) argText = argText.toUpperCase();
            // Add sign.
            if (currArg >= 0) {
              if (flagAlwaysSigned) {
                argText = "+" + argText;
              } else if (flagPadSign) {
                argText = " " + argText;
              }
            }
          }
          // Add padding.
          while (argText.length < width) {
            if (flagLeftAlign) {
              argText += " ";
            } else {
              if (flagZeroPad && (argText[0] == "-" || argText[0] == "+")) {
                argText = argText[0] + "0" + argText.slice(1);
              } else {
                argText = (flagZeroPad ? "0" : " ") + argText;
              }
            }
          }
          // Adjust case.
          if (next < 97) argText = argText.toUpperCase();
          // Insert the result into the buffer.
          argText.split("").forEach(function(chr) {
            ret.push(chr.charCodeAt(0));
          });
          break;
        }

       case "s":
        {
          // String.
          var arg = getNextArg("i8*");
          var argLength = arg ? strLen(arg) : "(null)".length;
          if (precisionSet) argLength = Math.min(argLength, precision);
          if (!flagLeftAlign) {
            while (argLength < width--) {
              ret.push(32);
            }
          }
          if (arg) {
            for (var i = 0; i < argLength; i++) {
              ret.push(HEAPU8[arg++ >>> 0]);
            }
          } else {
            ret = ret.concat(intArrayFromString("(null)".substr(0, argLength), true));
          }
          if (flagLeftAlign) {
            while (argLength < width--) {
              ret.push(32);
            }
          }
          break;
        }

       case "c":
        {
          // Character.
          if (flagLeftAlign) ret.push(getNextArg("i8"));
          while (--width > 0) {
            ret.push(32);
          }
          if (!flagLeftAlign) ret.push(getNextArg("i8"));
          break;
        }

       case "n":
        {
          // Write the length written so far to the next parameter.
          var ptr = getNextArg("i32*");
          HEAP32[((ptr) >>> 2) >>> 0] = ret.length;
          break;
        }

       case "%":
        {
          // Literal percent sign.
          ret.push(curr);
          break;
        }

       default:
        {
          // Unknown specifiers remain untouched.
          for (var i = startTextIndex; i < textIndex + 2; i++) {
            ret.push(HEAP8[i >>> 0]);
          }
        }
      }
      textIndex += 2;
    } else // TODO: Support a/A (hex float) and m (last error) specifiers.
    // TODO: Support %1${specifier} for arg selection.
    {
      ret.push(curr);
      textIndex += 1;
    }
  }
  return ret;
};

function jsStackTrace() {
  return (new Error).stack.toString();
}

var warnOnce = text => {
  warnOnce.shown ||= {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    err(text);
  }
};

/** @param {number=} flags */ function getCallstack(flags) {
  var callstack = jsStackTrace();
  // Find the symbols in the callstack that corresponds to the functions that
  // report callstack information, and remove everything up to these from the
  // output.
  var iThisFunc = callstack.lastIndexOf("_emscripten_log");
  var iThisFunc2 = callstack.lastIndexOf("_emscripten_get_callstack");
  var iNextLine = callstack.indexOf("\n", Math.max(iThisFunc, iThisFunc2)) + 1;
  callstack = callstack.slice(iNextLine);
  // If user requested to see the original source stack, but no source map
  // information is available, just fall back to showing the JS stack.
  if (flags & 8 && typeof emscripten_source_map == "undefined") {
    warnOnce('Source map information is not available, emscripten_log with EM_LOG_C_STACK will be ignored. Build with "--pre-js $EMSCRIPTEN/src/emscripten-source-map.min.js" linker flag to add source map loading to code.');
    flags ^= 8;
    flags |= 16;
  }
  // Process all lines:
  var lines = callstack.split("\n");
  callstack = "";
  // New FF30 with column info: extract components of form:
  // '       Object._main@http://server.com:4324:12'
  var newFirefoxRe = new RegExp("\\s*(.*?)@(.*?):([0-9]+):([0-9]+)");
  // Old FF without column info: extract components of form:
  // '       Object._main@http://server.com:4324'
  var firefoxRe = new RegExp("\\s*(.*?)@(.*):(.*)(:(.*))?");
  // Extract components of form:
  // '    at Object._main (http://server.com/file.html:4324:12)'
  var chromeRe = new RegExp("\\s*at (.*?) \\((.*):(.*):(.*)\\)");
  for (var l in lines) {
    var line = lines[l];
    var symbolName = "";
    var file = "";
    var lineno = 0;
    var column = 0;
    var parts = chromeRe.exec(line);
    if (parts && parts.length == 5) {
      symbolName = parts[1];
      file = parts[2];
      lineno = parts[3];
      column = parts[4];
    } else {
      parts = newFirefoxRe.exec(line);
      if (!parts) parts = firefoxRe.exec(line);
      if (parts && parts.length >= 4) {
        symbolName = parts[1];
        file = parts[2];
        lineno = parts[3];
        // Old Firefox doesn't carry column information, but in new FF30, it
        // is present. See https://bugzilla.mozilla.org/show_bug.cgi?id=762556
        column = parts[4] | 0;
      } else {
        // Was not able to extract this line for demangling/sourcemapping
        // purposes. Output it as-is.
        callstack += line + "\n";
        continue;
      }
    }
    var haveSourceMap = false;
    if (flags & 8) {
      var orig = emscripten_source_map.originalPositionFor({
        line: lineno,
        column: column
      });
      haveSourceMap = orig?.source;
      if (haveSourceMap) {
        if (flags & 64) {
          orig.source = orig.source.substring(orig.source.replace(/\\/g, "/").lastIndexOf("/") + 1);
        }
        callstack += `    at ${symbolName} (${orig.source}:${orig.line}:${orig.column})\n`;
      }
    }
    if ((flags & 16) || !haveSourceMap) {
      if (flags & 64) {
        file = file.substring(file.replace(/\\/g, "/").lastIndexOf("/") + 1);
      }
      callstack += (haveSourceMap ? (`     = ${symbolName}`) : (`    at ${symbolName}`)) + ` (${file}:${lineno}:${column})\n`;
    }
  }
  // Trim extra whitespace at the end of the output.
  callstack = callstack.replace(/\s+$/, "");
  return callstack;
}

var emscriptenLog = (flags, str) => {
  if (flags & 24) {
    str = str.replace(/\s+$/, "");
    // Ensure the message and the callstack are joined cleanly with exactly one newline.
    str += (str.length > 0 ? "\n" : "") + getCallstack(flags);
  }
  if (flags & 1) {
    if (flags & 4) {
      console.error(str);
    } else if (flags & 2) {
      console.warn(str);
    } else if (flags & 512) {
      console.info(str);
    } else if (flags & 256) {
      console.debug(str);
    } else {
      console.log(str);
    }
  } else if (flags & 6) {
    err(str);
  } else {
    out(str);
  }
};

function _emscripten_log(flags, format, varargs) {
  format >>>= 0;
  varargs >>>= 0;
  var result = formatString(format, varargs);
  var str = UTF8ArrayToString(result, 0);
  emscriptenLog(flags, str);
}

var getHeapMax = () => // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
// full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
// for any code that deals with heap sizes, which would require special
// casing all heap size related code to treat 0 specially.
4294901760;

var growMemory = size => {
  var b = wasmMemory.buffer;
  var pages = (size - b.byteLength + 65535) / 65536;
  try {
    // round size grow request up to wasm page size (fixed 64KB per spec)
    wasmMemory.grow(pages);
    // .grow() takes a delta compared to the previous size
    updateMemoryViews();
    return 1;
  } /*success*/ catch (e) {}
};

// implicit 0 return to save code size (caller will cast "undefined" into 0
// anyhow)
function _emscripten_resize_heap(requestedSize) {
  requestedSize >>>= 0;
  var oldSize = HEAPU8.length;
  // With multithreaded builds, races can happen (another thread might increase the size
  // in between), so return a failure, and let the caller retry.
  // Memory resize rules:
  // 1.  Always increase heap size to at least the requested size, rounded up
  //     to next page multiple.
  // 2a. If MEMORY_GROWTH_LINEAR_STEP == -1, excessively resize the heap
  //     geometrically: increase the heap size according to
  //     MEMORY_GROWTH_GEOMETRIC_STEP factor (default +20%), At most
  //     overreserve by MEMORY_GROWTH_GEOMETRIC_CAP bytes (default 96MB).
  // 2b. If MEMORY_GROWTH_LINEAR_STEP != -1, excessively resize the heap
  //     linearly: increase the heap size by at least
  //     MEMORY_GROWTH_LINEAR_STEP bytes.
  // 3.  Max size for the heap is capped at 2048MB-WASM_PAGE_SIZE, or by
  //     MAXIMUM_MEMORY, or by ASAN limit, depending on which is smallest
  // 4.  If we were unable to allocate as much memory, it may be due to
  //     over-eager decision to excessively reserve due to (3) above.
  //     Hence if an allocation fails, cut down on the amount of excess
  //     growth, in an attempt to succeed to perform a smaller allocation.
  // A limit is set for how much we can grow. We should not exceed that
  // (the wasm binary specifies it, so if we tried, we'd fail anyhow).
  var maxHeapSize = getHeapMax();
  if (requestedSize > maxHeapSize) {
    return false;
  }
  var alignUp = (x, multiple) => x + (multiple - x % multiple) % multiple;
  // Loop through potential heap size increases. If we attempt a too eager
  // reservation that fails, cut down on the attempted size and reserve a
  // smaller bump instead. (max 3 times, chosen somewhat arbitrarily)
  for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
    var overGrownHeapSize = oldSize * (1 + .2 / cutDown);
    // ensure geometric growth
    // but limit overreserving (default to capping at +96MB overgrowth at most)
    overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
    var newSize = Math.min(maxHeapSize, alignUp(Math.max(requestedSize, overGrownHeapSize), 65536));
    var replacement = growMemory(newSize);
    if (replacement) {
      return true;
    }
  }
  return false;
}

function _llvm_eh_typeid_for(type) {
  type >>>= 0;
  return type;
}

var wasmTableMirror = [];

/** @type {WebAssembly.Table} */ var wasmTable;

var getWasmTableEntry = funcPtr => {
  var func = wasmTableMirror[funcPtr];
  if (!func) {
    if (funcPtr >= wasmTableMirror.length) wasmTableMirror.length = funcPtr + 1;
    wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
  }
  return func;
};

var getCFunc = ident => {
  var func = Module["_" + ident];
  // closure exported function
  return func;
};

var writeArrayToMemory = (array, buffer) => {
  HEAP8.set(array, buffer >>> 0);
};

var stringToUTF8 = (str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);

var stackAlloc = sz => __emscripten_stack_alloc(sz);

var stringToUTF8OnStack = str => {
  var size = lengthBytesUTF8(str) + 1;
  var ret = stackAlloc(size);
  stringToUTF8(str, ret, size);
  return ret;
};

var UTF8Decoder = typeof TextDecoder != "undefined" ? new TextDecoder : undefined;

/**
     * Given a pointer 'idx' to a null-terminated UTF8-encoded string in the given
     * array that contains uint8 values, returns a copy of that string as a
     * Javascript String object.
     * heapOrArray is either a regular array, or a JavaScript typed array view.
     * @param {number} idx
     * @param {number=} maxBytesToRead
     * @return {string}
     */ var UTF8ArrayToString = (heapOrArray, idx, maxBytesToRead) => {
  idx >>>= 0;
  var endIdx = idx + maxBytesToRead;
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on
  // null terminator by itself.  Also, use the length info to avoid running tiny
  // strings through TextDecoder, since .subarray() allocates garbage.
  // (As a tiny code save trick, compare endPtr against endIdx using a negation,
  // so that undefined means Infinity)
  while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
  if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
    return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
  }
  var str = "";
  // If building with TextDecoder, we have already computed the string length
  // above, so test loop end condition against that
  while (idx < endPtr) {
    // For UTF8 byte structure, see:
    // http://en.wikipedia.org/wiki/UTF-8#Description
    // https://www.ietf.org/rfc/rfc2279.txt
    // https://tools.ietf.org/html/rfc3629
    var u0 = heapOrArray[idx++];
    if (!(u0 & 128)) {
      str += String.fromCharCode(u0);
      continue;
    }
    var u1 = heapOrArray[idx++] & 63;
    if ((u0 & 224) == 192) {
      str += String.fromCharCode(((u0 & 31) << 6) | u1);
      continue;
    }
    var u2 = heapOrArray[idx++] & 63;
    if ((u0 & 240) == 224) {
      u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
    } else {
      u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heapOrArray[idx++] & 63);
    }
    if (u0 < 65536) {
      str += String.fromCharCode(u0);
    } else {
      var ch = u0 - 65536;
      str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));
    }
  }
  return str;
};

/**
     * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
     * emscripten HEAP, returns a copy of that string as a Javascript String object.
     *
     * @param {number} ptr
     * @param {number=} maxBytesToRead - An optional length that specifies the
     *   maximum number of bytes to read. You can omit this parameter to scan the
     *   string until the first 0 byte. If maxBytesToRead is passed, and the string
     *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
     *   string will cut short at that byte index (i.e. maxBytesToRead will not
     *   produce a string of exact length [ptr, ptr+maxBytesToRead[) N.B. mixing
     *   frequent uses of UTF8ToString() with and without maxBytesToRead may throw
     *   JS JIT optimizations off, so it is worth to consider consistently using one
     * @return {string}
     */ var UTF8ToString = (ptr, maxBytesToRead) => {
  ptr >>>= 0;
  return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "";
};

/**
     * @param {string|null=} returnType
     * @param {Array=} argTypes
     * @param {Arguments|Array=} args
     * @param {Object=} opts
     */ var ccall = (ident, returnType, argTypes, args, opts) => {
  // For fast lookup of conversion functions
  var toC = {
    "string": str => {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) {
        // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        ret = stringToUTF8OnStack(str);
      }
      return ret;
    },
    "array": arr => {
      var ret = stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    }
  };
  function convertReturnValue(ret) {
    if (returnType === "string") {
      return UTF8ToString(ret);
    }
    if (returnType === "boolean") return Boolean(ret);
    return ret;
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
  function onDone(ret) {
    if (stack !== 0) stackRestore(stack);
    return convertReturnValue(ret);
  }
  ret = onDone(ret);
  return ret;
};

/**
     * @param {string=} returnType
     * @param {Array=} argTypes
     * @param {Object=} opts
     */ var cwrap = (ident, returnType, argTypes, opts) => {
  // When the function takes numbers and returns a number, we can just return
  // the original function
  var numericArgs = !argTypes || argTypes.every(type => type === "number" || type === "boolean");
  var numericRet = returnType !== "string";
  if (numericRet && numericArgs && !opts) {
    return getCFunc(ident);
  }
  return (...args) => ccall(ident, returnType, argTypes, args, opts);
};

var wasmImports = {
  /** @export */ __cxa_begin_catch: ___cxa_begin_catch,
  /** @export */ __cxa_end_catch: ___cxa_end_catch,
  /** @export */ __cxa_find_matching_catch_2: ___cxa_find_matching_catch_2,
  /** @export */ __cxa_find_matching_catch_3: ___cxa_find_matching_catch_3,
  /** @export */ __cxa_throw: ___cxa_throw,
  /** @export */ __handle_stack_overflow: ___handle_stack_overflow,
  /** @export */ __resumeException: ___resumeException,
  /** @export */ _abort_js: __abort_js,
  /** @export */ _emscripten_get_now_is_monotonic: __emscripten_get_now_is_monotonic,
  /** @export */ _emscripten_memcpy_js: __emscripten_memcpy_js,
  /** @export */ emscripten_date_now: _emscripten_date_now,
  /** @export */ emscripten_get_now: _emscripten_get_now,
  /** @export */ emscripten_log: _emscripten_log,
  /** @export */ emscripten_resize_heap: _emscripten_resize_heap,
  /** @export */ invoke_ii: invoke_ii,
  /** @export */ invoke_iii: invoke_iii,
  /** @export */ invoke_iiidi: invoke_iiidi,
  /** @export */ invoke_iiii: invoke_iiii,
  /** @export */ invoke_j: invoke_j,
  /** @export */ invoke_v: invoke_v,
  /** @export */ invoke_vi: invoke_vi,
  /** @export */ invoke_vii: invoke_vii,
  /** @export */ invoke_viii: invoke_viii,
  /** @export */ llvm_eh_typeid_for: _llvm_eh_typeid_for
};

var wasmExports = createWasm();

var ___wasm_call_ctors = () => (___wasm_call_ctors = wasmExports["__wasm_call_ctors"])();

var _malloc = Module["_malloc"] = a0 => (_malloc = Module["_malloc"] = wasmExports["malloc"])(a0);

var _free = Module["_free"] = a0 => (_free = Module["_free"] = wasmExports["free"])(a0);

var ___cxa_free_exception = a0 => (___cxa_free_exception = wasmExports["__cxa_free_exception"])(a0);

var _createBloomFilter = Module["_createBloomFilter"] = (a0, a1, a2) => (_createBloomFilter = Module["_createBloomFilter"] = wasmExports["createBloomFilter"])(a0, a1, a2);

var _createBloomFilterFromData = Module["_createBloomFilterFromData"] = a0 => (_createBloomFilterFromData = Module["_createBloomFilterFromData"] = wasmExports["createBloomFilterFromData"])(a0);

var _addToFilter = Module["_addToFilter"] = (a0, a1, a2) => (_addToFilter = Module["_addToFilter"] = wasmExports["addToFilter"])(a0, a1, a2);

var _checkInFilter = Module["_checkInFilter"] = (a0, a1, a2) => (_checkInFilter = Module["_checkInFilter"] = wasmExports["checkInFilter"])(a0, a1, a2);

var _deleteBloomFilter = Module["_deleteBloomFilter"] = a0 => (_deleteBloomFilter = Module["_deleteBloomFilter"] = wasmExports["deleteBloomFilter"])(a0);

var _getBloomFilterPointer = Module["_getBloomFilterPointer"] = a0 => (_getBloomFilterPointer = Module["_getBloomFilterPointer"] = wasmExports["getBloomFilterPointer"])(a0);

var _getBloomFilterSize = Module["_getBloomFilterSize"] = a0 => (_getBloomFilterSize = Module["_getBloomFilterSize"] = wasmExports["getBloomFilterSize"])(a0);

var _getBloomFilterNumberOfHashes = Module["_getBloomFilterNumberOfHashes"] = a0 => (_getBloomFilterNumberOfHashes = Module["_getBloomFilterNumberOfHashes"] = wasmExports["getBloomFilterNumberOfHashes"])(a0);

var _setThrew = (a0, a1) => (_setThrew = wasmExports["setThrew"])(a0, a1);

var __emscripten_tempret_set = a0 => (__emscripten_tempret_set = wasmExports["_emscripten_tempret_set"])(a0);

var _emscripten_stack_init = () => (_emscripten_stack_init = wasmExports["emscripten_stack_init"])();

var _emscripten_stack_get_free = () => (_emscripten_stack_get_free = wasmExports["emscripten_stack_get_free"])();

var _emscripten_stack_get_base = () => (_emscripten_stack_get_base = wasmExports["emscripten_stack_get_base"])();

var _emscripten_stack_get_end = () => (_emscripten_stack_get_end = wasmExports["emscripten_stack_get_end"])();

var __emscripten_stack_restore = a0 => (__emscripten_stack_restore = wasmExports["_emscripten_stack_restore"])(a0);

var __emscripten_stack_alloc = a0 => (__emscripten_stack_alloc = wasmExports["_emscripten_stack_alloc"])(a0);

var _emscripten_stack_get_current = () => (_emscripten_stack_get_current = wasmExports["emscripten_stack_get_current"])();

var ___cxa_increment_exception_refcount = a0 => (___cxa_increment_exception_refcount = wasmExports["__cxa_increment_exception_refcount"])(a0);

var ___cxa_decrement_exception_refcount = a0 => (___cxa_decrement_exception_refcount = wasmExports["__cxa_decrement_exception_refcount"])(a0);

var ___cxa_can_catch = (a0, a1, a2) => (___cxa_can_catch = wasmExports["__cxa_can_catch"])(a0, a1, a2);

var ___cxa_is_pointer_type = a0 => (___cxa_is_pointer_type = wasmExports["__cxa_is_pointer_type"])(a0);

var ___set_stack_limits = Module["___set_stack_limits"] = (a0, a1) => (___set_stack_limits = Module["___set_stack_limits"] = wasmExports["__set_stack_limits"])(a0, a1);

var dynCall_j = Module["dynCall_j"] = a0 => (dynCall_j = Module["dynCall_j"] = wasmExports["dynCall_j"])(a0);

function invoke_iii(index, a1, a2) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1, a2);
  } catch (e) {
    stackRestore(sp);
    if (e !== e + 0) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiidi(index, a1, a2, a3, a4) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1, a2, a3, a4);
  } catch (e) {
    stackRestore(sp);
    if (e !== e + 0) throw e;
    _setThrew(1, 0);
  }
}

function invoke_viii(index, a1, a2, a3) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1, a2, a3);
  } catch (e) {
    stackRestore(sp);
    if (e !== e + 0) throw e;
    _setThrew(1, 0);
  }
}

function invoke_ii(index, a1) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1);
  } catch (e) {
    stackRestore(sp);
    if (e !== e + 0) throw e;
    _setThrew(1, 0);
  }
}

function invoke_v(index) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)();
  } catch (e) {
    stackRestore(sp);
    if (e !== e + 0) throw e;
    _setThrew(1, 0);
  }
}

function invoke_vi(index, a1) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1);
  } catch (e) {
    stackRestore(sp);
    if (e !== e + 0) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiii(index, a1, a2, a3) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1, a2, a3);
  } catch (e) {
    stackRestore(sp);
    if (e !== e + 0) throw e;
    _setThrew(1, 0);
  }
}

function invoke_vii(index, a1, a2) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1, a2);
  } catch (e) {
    stackRestore(sp);
    if (e !== e + 0) throw e;
    _setThrew(1, 0);
  }
}

function invoke_j(index) {
  var sp = stackSave();
  try {
    return dynCall_j(index);
  } catch (e) {
    stackRestore(sp);
    if (e !== e + 0) throw e;
    _setThrew(1, 0);
  }
}

// Argument name here must shadow the `wasmExports` global so
// that it is recognised by metadce and minify-import-export-names
// passes.
function applySignatureConversions(wasmExports) {
  // First, make a copy of the incoming exports object
  wasmExports = Object.assign({}, wasmExports);
  var makeWrapper_pp = f => a0 => f(a0) >>> 0;
  var makeWrapper_p = f => () => f() >>> 0;
  wasmExports["malloc"] = makeWrapper_pp(wasmExports["malloc"]);
  wasmExports["emscripten_stack_get_base"] = makeWrapper_p(wasmExports["emscripten_stack_get_base"]);
  wasmExports["emscripten_stack_get_end"] = makeWrapper_p(wasmExports["emscripten_stack_get_end"]);
  wasmExports["_emscripten_stack_alloc"] = makeWrapper_pp(wasmExports["_emscripten_stack_alloc"]);
  wasmExports["emscripten_stack_get_current"] = makeWrapper_p(wasmExports["emscripten_stack_get_current"]);
  return wasmExports;
}

// include: postamble.js
// === Auto-generated postamble setup entry stuff ===
Module["ccall"] = ccall;

Module["cwrap"] = cwrap;

Module["UTF8ToString"] = UTF8ToString;

Module["stringToUTF8"] = stringToUTF8;

Module["lengthBytesUTF8"] = lengthBytesUTF8;

var calledRun;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!calledRun) run();
  if (!calledRun) dependenciesFulfilled = runCaller;
};

// try this again later, after new deps are fulfilled
function stackCheckInit() {
  // This is normally called automatically during __wasm_call_ctors but need to
  // get these values before even running any of the ctors so we call it redundantly
  // here.
  _emscripten_stack_init();
  // TODO(sbc): Move writeStackCookie to native to to avoid this.
  writeStackCookie();
}

function run() {
  if (runDependencies > 0) {
    return;
  }
  stackCheckInit();
  preRun();
  // a preRun added a dependency, run will be called later
  if (runDependencies > 0) {
    return;
  }
  function doRun() {
    // run may have just been called through dependencies being fulfilled just in this very frame,
    // or while the async setStatus time below was happening
    if (calledRun) return;
    calledRun = true;
    Module["calledRun"] = true;
    if (ABORT) return;
    initRuntime();
    readyPromiseResolve(Module);
    Module["onRuntimeInitialized"]?.();
    postRun();
  }
  if (Module["setStatus"]) {
    Module["setStatus"]("Running...");
    setTimeout(function() {
      setTimeout(function() {
        Module["setStatus"]("");
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}

if (Module["preInit"]) {
  if (typeof Module["preInit"] == "function") Module["preInit"] = [ Module["preInit"] ];
  while (Module["preInit"].length > 0) {
    Module["preInit"].pop()();
  }
}

run();

// end include: postamble.js
// include: postamble_modularize.js
// In MODULARIZE mode we wrap the generated code in a factory function
// and return either the Module itself, or a promise of the module.
// We assign to the `moduleRtn` global here and configure closure to see
// this as and extern so it won't get minified.
moduleRtn = readyPromise;


  return moduleRtn;
}
);
})();
if (typeof exports === 'object' && typeof module === 'object')
  module.exports = createModule;
else if (typeof define === 'function' && define['amd'])
  define([], () => createModule);
