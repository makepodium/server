import { execa } from 'execa';

import { storage } from '@/storage/index.js';

export const generateThumbnail = async (videoKey: string, thumbKey: string) => {
  const sourceUrl = await storage.presignedGet(videoKey, 600);

  const { stdout } = await execa(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-analyzeduration',
      '2000000',
      '-probesize',
      '2000000',
      '-ss',
      '1',
      '-i',
      sourceUrl,
      '-t',
      '5',
      '-frames:v',
      '1',
      '-q:v',
      '3',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      '-',
    ],
    {
      encoding: 'buffer',
      timeout: 30_000,
      killSignal: 'SIGKILL',
    },
  );

  const buffer = Buffer.isBuffer(stdout)
    ? stdout
    : Buffer.from(stdout as unknown as Uint8Array);

  await storage.putBuffer(thumbKey, buffer, 'image/jpeg');
};
