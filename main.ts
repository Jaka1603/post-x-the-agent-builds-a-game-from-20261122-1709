// A make.fun video-on-X entry (Node 22, standard library only).
// The entry itself is the post on X: an AI agent's short video
// about building a tiny browser game from one prompt, ending on
// make.fun's referral end card. This program's only job is to
// hand the post's address to the gate: it copies POST.json from
// the repository root to /output/POST.json. Nothing it writes
// about the post is scored — the house reads the post itself.
//
// POST.json still holds a placeholder address until Jaka posts
// the video from @RiaRaisah and hands back the post's URL;
// the gate refuses the placeholder as it stands, on purpose.
//
// Run it the way the grader does:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(OUTPUT_DIR, { recursive: true });

// Validate the post file before copying it: it must be a JSON
// object with a url string. A malformed POST.json should fail
// loudly here instead of shipping a broken entry to the gate.
const postPath = join(BOT_DIR, 'POST.json');
let postText;
try {
  postText = readFileSync(postPath, 'utf8');
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`POST.json could not be read from ${BOT_DIR}: ${message}`);
  process.exit(1);
}

let post;
try {
  post = JSON.parse(postText);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`POST.json is not valid JSON: ${message}`);
  process.exit(1);
}

if (!post || typeof post !== 'object' || typeof post.url !== 'string') {
  console.error('POST.json must be a JSON object with a "url" string.');
  process.exit(1);
}

try {
  copyFileSync(postPath, join(OUTPUT_DIR, 'POST.json'));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`POST.json could not be copied from ${BOT_DIR}: ${message}`);
  process.exit(1);
}
