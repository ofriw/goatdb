const FILE_READ_BUF_SIZE_BYTES = 1024 * 1024;
const LINE_DELIMITER_BYTE = 10; // '\n'

async function measureOffsetCalculation(filePath: string) {
  console.log('Starting offset calculation test...');

  const file = await Deno.open(filePath);
  const fileSize = await file.seek(0, Deno.SeekMode.End);
  await file.seek(0, Deno.SeekMode.Start);
  console.log(`Reported file size: ${(fileSize / 1024 / 1024).toFixed(3)} MB`);

  const readBuf = new Uint8Array(FILE_READ_BUF_SIZE_BYTES);
  let totalBytesProcessed = 0;
  let totalOffsetTime = 0;
  let lineCount = 0;
  let totalOffset = 0;
  let objectBufOffset = 0;
  let lastGoodFileOffset = 0;
  // let nIter = 0;
  let totalTime = performance.now();
  while (totalBytesProcessed < fileSize) {
    // nIter++;
    const bytesRead = await file.read(readBuf);
    if (bytesRead === null) break;

    let readBufStart = 0;
    let readBufEnd = 0;

    while (readBufStart < bytesRead) {
      readBufEnd = readBufStart;

      while (
        readBufEnd < bytesRead &&
        readBuf[readBufEnd] !== LINE_DELIMITER_BYTE
      ) {
        ++readBufEnd;
      }

      const readLen = readBufEnd - readBufStart;

      if (readLen > 0) {
        totalOffset += readLen;
        objectBufOffset += readLen;
      }

      readBufStart = readBufEnd + 1;

      if (readBuf[readBufEnd] === LINE_DELIMITER_BYTE && objectBufOffset > 0) {
        lineCount++;
        lastGoodFileOffset += objectBufOffset + 1;
        objectBufOffset = 0;
      }
    }

    totalBytesProcessed += bytesRead;
  }
  totalTime = performance.now() - totalTime;
  file.close();

  console.log('\nResults:');
  console.log(
    `Total bytes processed: ${(totalBytesProcessed / 1024 / 1024).toFixed(
      2
    )} MB`
  );
  console.log(`Number of lines found: ${lineCount.toLocaleString()}`);
  console.log(`Total calculated offset: ${totalOffset.toLocaleString()} bytes`);
  console.log(
    `Total offset calculation took: ${(totalTime / 1000).toFixed(3)} seconds`
  );
}

if (import.meta.main) {
  const filePath =
    '/Users/amit-steiner/Documents/Amit/goatDB/test/notes1M.jsonl';
  await measureOffsetCalculation(filePath);
}
