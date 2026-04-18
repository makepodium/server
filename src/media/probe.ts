import { execa } from 'execa';

import { storage } from '@/storage/index.js';

interface FfprobeFormat {
  duration?: string;
}

interface FfprobeOutput {
  format?: FfprobeFormat;
}

export interface ProbeResult {
  durationSeconds: number | null;
}

export const probeVideo = async (videoKey: string): Promise<ProbeResult> => {
  const sourceUrl = await storage.presignedGet(videoKey, 600);

  try {
    const { stdout } = await execa(
      'ffprobe',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-analyzeduration',
        '2000000',
        '-probesize',
        '2000000',
        '-print_format',
        'json',
        '-show_entries',
        'format=duration',
        '-i',
        sourceUrl,
      ],
      {
        timeout: 30_000,
        killSignal: 'SIGKILL',
      },
    );

    const parsed = JSON.parse(stdout) as FfprobeOutput;
    const raw = parsed.format?.duration;
    if (!raw) return { durationSeconds: null };

    const parsedNumber = Number.parseFloat(raw);
    if (!Number.isFinite(parsedNumber) || parsedNumber <= 0) {
      return { durationSeconds: null };
    }

    return { durationSeconds: parsedNumber };
  } catch {
    return { durationSeconds: null };
  }
};
