
#!/bin/bash

OPTIMIZATION="-O3"
SANITIZER=""

while [[ "$#" -gt 0 ]]; do
    case $1 in
        -O0|-O1|-O2|-O3|-Os|-Oz) OPTIMIZATION="$1"; shift ;;
        --sanitize=*) SANITIZER="${1#*=}"; shift ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
done

# Check if Emscripten is installed
if ! command -v emcc &> /dev/null
then
    echo "Emscripten could not be found. Please install it and make sure it's in your PATH."
    exit 1
fi

# Base compilation flags
CFLAGS=(-std=c++20 -s WASM=1
    -I.
    -I../external
    -I/opt/homebrew/include
    -s EXPORTED_FUNCTIONS='["_malloc", "_free", "_createBloomFilter", "_createBloomFilterFromData", "_addToFilter", "_checkInFilter", "_deleteBloomFilter", "_getBloomFilterPointer", "_getBloomFilterSize", "_getBloomFilterNumberOfHashes"]'
    -s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap", "UTF8ToString"]'
    -s DISABLE_EXCEPTION_CATCHING=0
    -s ALLOW_MEMORY_GROWTH=1
    -s INITIAL_MEMORY=256MB
    -s MAXIMUM_MEMORY=4GB
    -s NO_EXIT_RUNTIME=1
    -s ENVIRONMENT='web'
    --no-entry
    -s ERROR_ON_UNDEFINED_SYMBOLS=0
    -s ASSERTIONS=1
    -gsource-map 
    -s STACK_OVERFLOW_CHECK=2  
)

# Add optimization flag
CFLAGS+=($OPTIMIZATION)

# Add sanitizer if specified
if [ ! -z "$SANITIZER" ]; then
    CFLAGS+=(-fsanitize="$SANITIZER")
fi

# Compile C++ to WebAssembly
emcc "${CFLAGS[@]}" -o bloom_filterOriginal.js BloomFilterOriginal.cpp ../external/MurmurHash3.cpp

echo "Compilation complete. Output files: bloom_filterOrg.js and bloom_filterOrg.wasm"
echo "Optimization level: $OPTIMIZATION"
if [ ! -z "$SANITIZER" ]; then
    echo "Sanitizer: $SANITIZER"
fi

# git clone https://github.com/emscripten-core/emsdk.git
# cd emsdk
# ./emsdk install latest
# ./emsdk activate latest
# source ./emsdk_env.sh


# --no-entry :
#This flag tells the Emscripten compiler that your program doesn't have a main() function.
#It's typically used when you're compiling a library or a set of functions to be called from JavaScript, 
#rather than a standalone program. This is appropriate for your Bloom filter implementation, 
#which will be used as a library in a web environment.

# MAXIMUM_MEMORY=4GB to allow for larger Bloom filters if needed.
# NO_EXIT_RUNTIME=1 to keep the runtime alive, which can be beneficial for persistent objects like your Bloom filter.
# ENVIRONMENT='web' to optimize for web environments.
# --no-entry to indicate that there's no main function, which is typical for library-like WASM modules.
