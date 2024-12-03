#ifndef BLOOM_FILTER_2_H
#define BLOOM_FILTER_2_H

#include <cstdint>
#include <stdexcept>
#include <string>

// TODO: check these preprocessor directives..
#if defined(__BYTE_ORDER__) && (__BYTE_ORDER__ == __ORDER_BIG_ENDIAN__)
#define IS_BIG_ENDIAN 1
#elif defined(__BYTE_ORDER__) && (__BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__)
#define IS_BIG_ENDIAN 0
#elif defined(__BIG_ENDIAN__) || defined(__ARMEB__) || defined(__THUMBEB__) || \
    defined(__AARCH64EB__) || defined(_MIBSEB) || defined(__MIBSEB) || defined(__MIBSEB__)
#define IS_BIG_ENDIAN 1
#elif defined(__LITTLE_ENDIAN__) || defined(__ARMEL__) || defined(__THUMBEL__) || \
    defined(__AARCH64EL__) || defined(_MIPSEL) || defined(__MIPSEL) || defined(__MIPSEL__)
#define IS_BIG_ENDIAN 0
#else
#error "Unable to determine endianness, manual configuration required"
#endif

class FalsePositiveRate
{
public:
  explicit FalsePositiveRate(double value) : value_(value)
  {
    if (value <= 0 || value >= 1)
    {
      throw std::invalid_argument("FPR must be between 0 and 1");
    }
  }
  double getValue() const
  {
    return value_;
  }

private:
  double value_;
};

#pragma pack(push, 1)
struct BloomFilterSerialized
{
  uint32_t size;       // Bloom filter size (number of bits) - 4 bytes
  uint32_t num_hashes; // Number of hash functions - 4 bytes
  uint32_t hashes[30]; // seeds will follow as variable length array - 40*4 = 120 bytes
  uint64_t bytes[];    // bits will follow as variable length array
} __attribute__((aligned(8)));
#pragma pack(pop)

class BloomFilter
{
private:
  BloomFilterSerialized *internal;
  size_t totalSize;

  static size_t calculateTotalBits(size_t size, double fpr);
  static size_t calculateOptMaxNumHashes(size_t itemCount, size_t bitArraySize);
  static uint32_t hashString(const std::string &value, uint32_t seed);
  void setBit(size_t index);
  bool getBit(size_t index) const;

public:
  BloomFilter(size_t size, FalsePositiveRate fpr, size_t maxHashes = 0);
  BloomFilter(const char *buff);
  ~BloomFilter();
  void add(const std::string &value);
  bool has(const std::string &value) const;
  void clear();
  double fillRate() const;
  const char *getInternalPointer() const;
  char *getMutableInternalPointer();

  size_t getNumberOfHashes() const
  {
    return internal->num_hashes;
  }

  size_t getTotalSize() const
  {
    return totalSize;
  }

  size_t getSize() const
  {
    return internal->size;
  }
};

#endif // BLOOM_FILTER_2_H