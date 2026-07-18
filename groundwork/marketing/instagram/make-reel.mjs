// Composes the 16:9 product demo (marketing/demo.mp4) into a 9:16 branded
// frame for Instagram Reels / Stories. Output: instagram/reel-9x16.mp4.
//
// Usage from groundwork/ (after marketing/demo.mp4 and the reel frame PNG
// exist): node marketing/instagram/make-reel.mjs
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const demo = path.join(here, '..', 'demo.mp4');
const frame = path.join(here, 'reel-frame-1080x1920.png');
const out = path.join(here, 'reel-9x16.mp4');

for (const f of [demo, frame]) {
  if (!fs.existsSync(f)) throw new Error(`Missing ${f}`);
}

const ffmpeg =
  process.env.FFMPEG_PATH ||
  execFileSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'])
    .toString()
    .trim();

// The demo is 1280x720. Scale to 1080 wide (-> 1080x608) and overlay it on
// the frame, centered horizontally, in the reserved band under the header.
// Header is ~470px tall; place the video with its top at y=520.
const VIDEO_W = 1080;
const VIDEO_TOP = 560;

execFileSync(
  ffmpeg,
  [
    '-y',
    '-loop', '1', '-i', frame, // input 0: static background (looped)
    '-i', demo, // input 1: demo video
    '-filter_complex',
    `[1:v]scale=${VIDEO_W}:-2[v];[0:v][v]overlay=(W-w)/2:${VIDEO_TOP}:shortest=1[out]`,
    '-map', '[out]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-r', '30', '-an',
    '-movflags', '+faststart',
    out,
  ],
  { stdio: 'inherit' },
);

const mb = (fs.statSync(out).size / 1e6).toFixed(1);
console.log(`wrote ${out} (${mb} MB)`);
