
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <iterator>
#include <random>
#include <stdexcept>
#include <string>
#include <vector>

#include "BloomFilter.hpp"
#include "MurmurHash3.h"

static std::mt19937 _gGen{static_cast<std::mt19937::result_type>(
    std::chrono::system_clock::now().time_since_epoch().count())};
static std::uniform_int_distribution<> _gDis(0, std::numeric_limits<int>::max());

static inline uint32_t genRandomSeed()
{
    return _gDis(_gGen);
}

BloomFilter::BloomFilter(size_t size, FalsePositiveRate fpr, size_t maxHashes)
{
    size_t tempSize = calculateTotalBits(size, fpr.getValue());
    size_t tempNumHashes = calculateOptMaxNumHashes(size, tempSize);
    if (maxHashes > 0 && tempNumHashes > maxHashes)
    {
        tempNumHashes = maxHashes;
    }
    // Calculate the number of 64-bit chunks required to store the bits
    size_t bytesSize = static_cast<size_t>(std::ceil(static_cast<double>(tempSize) / 64.0));
    // Total size = metadata (BloomFilterSerialized) + bit array size
    totalSize = sizeof(BloomFilterSerialized) + bytesSize * sizeof(uint64_t);

    internal = reinterpret_cast<BloomFilterSerialized *>(malloc(totalSize));

    if (internal == nullptr)
    {
        throw std::bad_alloc();
    }

    internal->size = tempSize;
    internal->num_hashes = tempNumHashes;

    for (size_t i = 0; i < tempNumHashes && i < 30; ++i)
    {
        internal->hashes[i] = genRandomSeed();
    }
    std::memset(internal->bytes, 0, bytesSize * sizeof(uint64_t));
}

BloomFilter::~BloomFilter()
{
    if (internal)
    {
        free(internal);
        internal = nullptr; // Prevent further access to the freed memory
    }
}

const char *BloomFilter::getInternalPointer() const
{
#if IS_BIG_ENDIAN
    throw std::runtime_error("Big endian systems are not supported");
#endif
    return reinterpret_cast<const char *>(internal);
}

char *BloomFilter::getMutableInternalPointer()
{
#if IS_BIG_ENDIAN
    throw std::runtime_error("Big endian systems are not supported");
#endif
    return reinterpret_cast<char *>(internal);
}

// Zero-copy constructor
BloomFilter::BloomFilter(const char *buff)
{
#if IS_BIG_ENDIAN
    throw std::runtime_error("Big endian systems are not supported");
#endif
    internal =
        const_cast<BloomFilterSerialized *>(reinterpret_cast<const BloomFilterSerialized *>(buff));
}

auto BloomFilter::hashString(const std::string &value, uint32_t seed) -> uint32_t
{
    std::array<uint64_t, 2> hash = {0, 0};
    MurmurHash3_x64_128(value.data(), static_cast<int>(value.length()), seed, hash.data());
    return static_cast<uint32_t>(hash[0]);
}

void BloomFilter::setBit(size_t index)
{
    if (index < internal->size)
    {
        internal->bytes[index / 64] |= (1ULL << (index % 64));
    }
}

auto BloomFilter::getBit(size_t index) const -> bool
{
    if (index < internal->size)
    {
        return (internal->bytes[index / 64] & (1ULL << (index % 64))) != 0;
    }
    return false;
}

void BloomFilter::add(const std::string &value)
{
    for (size_t i = 0; i < internal->num_hashes; ++i)
    {
        uint32_t hash = BloomFilter::hashString(value, internal->hashes[i]);
        setBit(hash % internal->size);
    }
}

auto BloomFilter::has(const std::string &value) const -> bool
{
    for (size_t i = 0; i < internal->num_hashes; ++i)
    {
        uint32_t hash = BloomFilter::hashString(value, internal->hashes[i]);
        if (!getBit(hash % internal->size))
        {
            return false;
        }
    }
    return true;
}

void BloomFilter::clear()
{
    size_t bytesSize = static_cast<size_t>(std::ceil(static_cast<double>(internal->size) / 64.0));
    std::memset(internal->bytes, 0, bytesSize * sizeof(uint64_t));
}

double BloomFilter::fillRate() const
{
    size_t count = 0;
    size_t bytesSize = static_cast<size_t>(std::ceil(static_cast<double>(internal->size) / 64.0));
    for (size_t i = 0; i < bytesSize; ++i)
    {
        count += __builtin_popcountll(internal->bytes[i]);
    }
    return static_cast<double>(count) / static_cast<double>(internal->size);
}

auto BloomFilter::calculateTotalBits(size_t size, double fpr) -> size_t
{
    if (size == 0 || fpr <= 0 || fpr >= 1)
    {
        return 1;
    }
    return static_cast<size_t>(
        std::ceil((size * std::log(fpr)) / std::log(1 / std::pow(2, std::log(2)))));
}

auto BloomFilter::calculateOptMaxNumHashes(size_t itemCount, size_t bitArraySize) -> size_t
{
    if (itemCount == 0 || bitArraySize == 0)
    {
        return 1;
    }
    return static_cast<size_t>(
        std::round(static_cast<double>(bitArraySize) / itemCount * std::log(2)));
}

//	std::unique_ptr:
// Ensures exclusive ownership of the object it points to. Only one std::unique_ptr can point to a
// particular object, and when the unique_ptr goes out of scope, it automatically deletes the
// object, preventing memory leaks.
std::unique_ptr<BloomFilter> createBloomFilterUnique(size_t size, double fpr, size_t maxHashes)
{
    return std::make_unique<BloomFilter>(size, FalsePositiveRate(fpr), maxHashes);
}

extern "C"
{

    EMSCRIPTEN_KEEPALIVE
    BloomFilter *createBloomFilter(size_t size, double fpr, size_t maxHashes)
    {
        return new BloomFilter(size, FalsePositiveRate(fpr), maxHashes);
    }

    EMSCRIPTEN_KEEPALIVE
    BloomFilter *createBloomFilterFromData(const char *data)
    {
        if (data == nullptr)
        {
            emscripten_log(EM_LOG_ERROR, "Error: data is null");
            return nullptr;
        }
        try
        {
            BloomFilter *filter = new BloomFilter(data);
            return filter;
        }
        catch (const std::exception &e)
        {
            emscripten_log(EM_LOG_ERROR, "Exception in createBloomFilterFromData: %s", e.what());
            return nullptr;
        }
    }

    EMSCRIPTEN_KEEPALIVE
    void addToFilter(BloomFilter *filter, const char *value)
    {
        if ((filter != nullptr) && (value != nullptr))
        {
            filter->add(std::string(value));
        }
    }

    EMSCRIPTEN_KEEPALIVE
    auto checkInFilter(BloomFilter *filter, const char *value) -> int
    {
        if ((filter != nullptr) && (value != nullptr))
        {
            return filter->has(std::string(value)) ? 1 : 0;
        }
        return 0;
    }

    EMSCRIPTEN_KEEPALIVE
    void deleteBloomFilter(BloomFilter *filter)
    {
        if (filter != nullptr)
        {
            emscripten_log(EM_LOG_INFO, "Deleting BloomFilter object.");
            delete filter;
        }
    }

    EMSCRIPTEN_KEEPALIVE
    const char *getBloomFilterPointer(BloomFilter *filter)
    {
        return filter->getInternalPointer();
    }

    EMSCRIPTEN_KEEPALIVE
    size_t getBloomFilterSize(BloomFilter *filter)
    {
        return filter->getSize();
    }

    EMSCRIPTEN_KEEPALIVE
    size_t getBloomFilterNumberOfHashes(BloomFilter *filter)
    {
        return filter->getNumberOfHashes();
    }
}
