import yargs from 'yargs';
import {
  PutObjectCommand,
  PutObjectRequest,
  S3Client,
} from 'npm:@aws-sdk/client-s3';
import { Upload } from 'npm:@aws-sdk/lib-storage';
import * as path from 'std/path/mod.ts';
import { defaultAssetsBuild } from './generate-static-assets.ts';
import { VCurrent } from '../base/version-number.ts';
import { getRepositoryPath } from '../base/development.ts';
import { tuple4ToString } from '../base/tuple.ts';
import { BuildChannel, generateBuildInfo } from './build-info.ts';

interface Arguments {
  upload?: boolean;
  linux?: boolean;
  control?: boolean;
  both?: boolean;
  beta?: boolean;
  release?: boolean;
}

export type BuildTarget = 'server' | 'control';

async function compressFile(srcPath: string, dstPath: string): Promise<void> {
  const src = await Deno.open(srcPath, { read: true, write: false });
  const dst = await Deno.open(dstPath, {
    read: true,
    write: true,
    create: true,
    truncate: true,
  });
  await src.readable
    .pipeThrough(new CompressionStream('gzip'))
    .pipeTo(dst.writable);
}

async function uploadToS3(uploadPath: string): Promise<void> {
  const file = await Deno.open(uploadPath, { read: true, write: false });
  const client = new S3Client({ region: 'us-east-1' });
  const req: PutObjectRequest = {
    Body: file.readable,
    Bucket: 'ovvio2-release',
    Key: path.basename(uploadPath),
    ACL: 'public-read',
    ContentType: 'application/octet-stream',
  };
  console.log(`Uploading ${uploadPath} \u{02192} ${req.Bucket}/${req.Key}`);

  const parallelUploads3 = new Upload({
    client: client,
    params: req,
  });

  const dot = new TextEncoder().encode('.');
  parallelUploads3.on('httpUploadProgress', (_progress) => {
    Deno.stdout.write(dot);
  });

  await parallelUploads3.done();
  console.log('\nDone');
}

// async function putS3Object(uploadPath: string): Promise<boolean> {
//   const file = await Deno.readFile(uploadPath);
//   const client = new S3Client({ region: 'us-east-1' });
//   const req: PutObjectRequest = {
//     Body: file,
//     Bucket: 'ovvio2-release',
//     Key: path.basename(uploadPath),
//     ACL: 'public-read',
//   };
//   console.log(
//     `Uploading atomically ${uploadPath} \u{02192} ${req.Bucket}/${req.Key}`
//   );
//   const resp = await client.send(new PutObjectCommand(req));
//   return resp.ETag !== undefined && resp.ETag.length > 0;
// }

export function outputFileName(
  target: BuildTarget,
  deployment: boolean,
  channel?: BuildChannel,
): string {
  return `ovvio-${target}-${deployment ? 'linux' : Deno.build.os}${
    channel && channel !== 'release' ? '-' + channel : ''
  }`;
}

async function hashFile(
  inputFilePath: string,
  outputFilePath?: string,
): Promise<void> {
  const file = await Deno.readFile(inputFilePath);
  console.log(`Generating SHA-512 checksum for ${inputFilePath}...`);
  const checksum = await crypto.subtle.digest('SHA-512', file);
  if (outputFilePath === undefined) {
    outputFilePath = inputFilePath + '.sha512';
  }
  try {
    await Deno.remove(outputFilePath, { recursive: true });
  } catch (_: unknown) {
    //
  }
  await Deno.writeFile(outputFilePath, new Uint8Array(checksum));
  console.log(`Checksum written successfully to ${outputFilePath}`);
}

async function build(
  repoPath: string,
  linux: boolean,
  target: BuildTarget,
  channel?: BuildChannel,
): Promise<void> {
  console.log(
    `Generating ${target} executable for ${linux ? 'linux' : Deno.build.os}...`,
  );
  const fileName = outputFileName(target, linux, channel);
  const outputDir = path.join(repoPath, 'build');
  const binaryOutputPath = path.join(outputDir, fileName);
  Deno.chdir(repoPath);
  const compileArgs = [
    'compile',
    '-A',
    '--lock-write',
    '--no-check',
    // '--v8-flags=--predictable',
    '--allow-read',
    '--allow-env',
    '--allow-run',
    '--allow-sys',
    '--allow-write',
    '--allow-net',
    `--output=${binaryOutputPath}`,
    // '--include',
    // path.join('.', 'server', 'sqlite3-worker.ts'),
  ];
  if (linux) {
    compileArgs.push('--target=x86_64-unknown-linux-gnu');
  }
  if (target === 'server') {
    // compileArgs.push('--unstable');
    // compileArgs.push('--allow-ffi');
    compileArgs.push(path.join(repoPath, 'server', 'run-server.ts'));
  } else {
    compileArgs.push(
      path.join(repoPath, 'server-control', 'server-control.ts'),
    );
  }
  const compileLocalCmd = new Deno.Command('deno', {
    args: compileArgs,
  });
  const output = await compileLocalCmd.output();
  if (!output.success) {
    console.log('Build failed');
    return;
  }
}

function colorForChannel(channel: BuildChannel): string {
  switch (channel) {
    case 'alpha':
      return 'blue';

    case 'beta':
      return 'green';

    case 'release':
      return 'red';
  }
}

async function main(): Promise<void> {
  const args: Arguments = yargs(Deno.args)
    .option('upload', {
      type: 'boolean',
      default: false,
      description:
        'Whether or not to upload the resulting binaries to S3 for release',
    })
    .option('linux', {
      type: 'boolean',
      default: false,
      description: `If supplied, will generate x64 linux build rather than ${Deno.build.os} build`,
    })
    .option('both', {
      type: 'boolean',
      default: false,
      description: `If supplied, will build both server and control binaries`,
    })
    .option('beta', {
      type: 'boolean',
      default: false,
      description: `If supplied, will generate beta channel build`,
    })
    .option('release', {
      type: 'boolean',
      default: false,
      description: `If supplied, will generate release channel build`,
    })
    .parse();

  let channel: BuildChannel = 'alpha';
  if (args?.beta === true) {
    channel = 'beta';
  } else if (args?.release === true) {
    channel = 'release';
  }
  if (args?.upload === true && args?.linux === true) {
    console.log(
      `%cUpdating %c${channel}%c channel...`,
      'color: default',
      `color: ${colorForChannel(channel)}`,
      'color: default',
    );
    if (channel === 'beta') {
      alert('Press enter to start');
    } else if (channel === 'release') {
      if (!confirm('Are you sure?')) {
        return;
      }
    }
  }

  console.log(`Building based on version ${tuple4ToString(VCurrent)}`);
  const repoPath = await getRepositoryPath();
  const buildDirPath = path.join(repoPath, 'build');
  try {
    await Deno.remove(buildDirPath, { recursive: true });
  } catch (_: unknown) {}
  await Deno.mkdir(buildDirPath, { recursive: true });
  const controlBuild = args?.control === true;
  if (!controlBuild) {
    await defaultAssetsBuild();
  }

  await Deno.writeTextFile(
    path.join(buildDirPath, 'build-info.json'),
    JSON.stringify(generateBuildInfo(channel)),
  );
  if (args?.both === true) {
    await Promise.all([
      build(repoPath, args?.linux === true, 'server', channel),
      build(repoPath, args?.linux === true, 'control', channel),
    ]);
  } else {
    await build(
      repoPath,
      args?.linux === true,
      controlBuild ? 'control' : 'server',
      channel,
    );
  }
}

if (import.meta.main) {
  main();
}
