import { Injectable } from '@nestjs/common';
import * as sharp from 'sharp';
import {
  TextVideoQcResult,
  TextVideoStillQcInput,
  TextVideoStillQcPort,
  TextVideoVideoQcInput,
  TextVideoVideoQcPort,
} from './text-video-pipeline.ports';

export const STILL_TECHNICAL_QC_POLICY_VERSION = 'still-technical-v1';
export const VIDEO_TECHNICAL_QC_POLICY_VERSION = 'video-technical-v1';

// Bounds are deliberately loose: technical QC v1 only rejects artifacts that
// are unusable as a product result (undecodable, flat/black frame, missing
// audio, absurd duration). Semantic QC (person count, prompt adherence, motion)
// is a separate, later policy version.
const STILL_MIN_MEAN_LUMA = 6;
const STILL_MAX_MEAN_LUMA = 249;
const STILL_MIN_STDDEV = 3;
const VIDEO_MIN_BYTES = 200_000;
const VIDEO_MIN_DURATION_S = 3.5;
const VIDEO_MAX_DURATION_S = 12.5;

@Injectable()
export class TechnicalTextVideoStillQc implements TextVideoStillQcPort {
  isConfigured(): boolean {
    return true;
  }

  async evaluate(
    input: Readonly<TextVideoStillQcInput>,
  ): Promise<TextVideoQcResult> {
    const startedAt = Date.now();
    const done = (
      decision: TextVideoQcResult['decision'],
      reasonCode: string | null,
    ): TextVideoQcResult => ({
      decision,
      reasonCode,
      durationMs: Date.now() - startedAt,
    });

    if (input.policyVersion !== STILL_TECHNICAL_QC_POLICY_VERSION) {
      return done('error', 'STILL_QC_POLICY_UNSUPPORTED');
    }

    let metadata: sharp.Metadata;
    let stats: sharp.Stats;
    try {
      const image = sharp(input.canonicalPng, { failOn: 'error' });
      metadata = await image.metadata();
      stats = await image.stats();
    } catch {
      return done('error', 'STILL_QC_DECODE_ERROR');
    }

    if (metadata.format !== 'png') {
      return done('reject', 'STILL_QC_NOT_PNG');
    }
    if (
      metadata.width !== input.artifact.width ||
      metadata.height !== input.artifact.height
    ) {
      return done('reject', 'STILL_QC_DIMENSION_MISMATCH');
    }

    const rgb = stats.channels.slice(0, 3);
    if (rgb.length < 3) {
      return done('reject', 'STILL_QC_CHANNELS_INVALID');
    }
    const meanLuma =
      0.2126 * rgb[0].mean + 0.7152 * rgb[1].mean + 0.0722 * rgb[2].mean;
    const maxStdev = Math.max(...rgb.map((c) => c.stdev));
    if (maxStdev < STILL_MIN_STDDEV) {
      return done('reject', 'STILL_QC_FLAT_IMAGE');
    }
    if (meanLuma < STILL_MIN_MEAN_LUMA) {
      return done('reject', 'STILL_QC_NEAR_BLACK');
    }
    if (meanLuma > STILL_MAX_MEAN_LUMA) {
      return done('reject', 'STILL_QC_NEAR_WHITE');
    }
    return done('pass', null);
  }
}

@Injectable()
export class TechnicalTextVideoVideoQc implements TextVideoVideoQcPort {
  isConfigured(): boolean {
    return true;
  }

  async evaluate(
    input: Readonly<TextVideoVideoQcInput>,
  ): Promise<TextVideoQcResult> {
    const startedAt = Date.now();
    const done = (
      decision: TextVideoQcResult['decision'],
      reasonCode: string | null,
    ): TextVideoQcResult => ({
      decision,
      reasonCode,
      durationMs: Date.now() - startedAt,
    });

    if (input.policyVersion !== VIDEO_TECHNICAL_QC_POLICY_VERSION) {
      return done('error', 'VIDEO_QC_POLICY_UNSUPPORTED');
    }
    if (input.mp4Bytes.byteLength !== input.artifact.byteLength) {
      return done('error', 'VIDEO_QC_BYTE_LENGTH_MISMATCH');
    }
    if (input.artifact.byteLength < VIDEO_MIN_BYTES) {
      return done('reject', 'VIDEO_QC_TOO_SMALL');
    }
    if (
      input.mp4Bytes.byteLength < 12 ||
      input.mp4Bytes.subarray(4, 8).toString('ascii') !== 'ftyp'
    ) {
      return done('reject', 'VIDEO_QC_NOT_MP4');
    }
    const { width, height, hasAudio } = input.artifact;
    if (
      width === null ||
      height === null ||
      width <= 0 ||
      height <= 0 ||
      width % 32 !== 0 ||
      height % 32 !== 0
    ) {
      return done('reject', 'VIDEO_QC_DIMENSIONS_INVALID');
    }
    if (hasAudio !== true) {
      return done('reject', 'VIDEO_QC_AUDIO_MISSING');
    }
    const durationS = readMvhdDurationSeconds(input.mp4Bytes);
    if (durationS === null) {
      return done('reject', 'VIDEO_QC_DURATION_UNREADABLE');
    }
    if (durationS < VIDEO_MIN_DURATION_S || durationS > VIDEO_MAX_DURATION_S) {
      return done('reject', 'VIDEO_QC_DURATION_OUT_OF_RANGE');
    }
    return done('pass', null);
  }
}

/**
 * Reads presentation duration from the mvhd box without external tooling.
 * Returns null when no parseable mvhd box exists.
 */
export function readMvhdDurationSeconds(mp4: Buffer): number | null {
  let searchFrom = 0;
  while (searchFrom < mp4.length) {
    const at = mp4.indexOf('mvhd', searchFrom, 'ascii');
    if (at < 0) {
      return null;
    }
    // 'mvhd' is the box type; the box body starts right after it.
    const body = at + 4;
    try {
      const version = mp4.readUInt8(body);
      if (version === 0 && body + 24 <= mp4.length) {
        const timescale = mp4.readUInt32BE(body + 12);
        const duration = mp4.readUInt32BE(body + 16);
        if (timescale > 0) {
          return duration / timescale;
        }
      } else if (version === 1 && body + 32 <= mp4.length) {
        const timescale = mp4.readUInt32BE(body + 20);
        const duration = Number(mp4.readBigUInt64BE(body + 24));
        if (timescale > 0 && Number.isFinite(duration)) {
          return duration / timescale;
        }
      }
    } catch {
      return null;
    }
    searchFrom = at + 4;
  }
  return null;
}
