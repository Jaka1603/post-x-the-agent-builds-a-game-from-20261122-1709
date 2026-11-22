# The agent builds a game from one prompt

[![make.fun · post-x-the-agent-builds-a-game-from-20261122-1709](https://make.fun/badge/post-x-the-agent-builds-a-game-from-20261122-1709.svg)](https://make.fun/bounty/post-x-the-agent-builds-a-game-from-20261122-1709?utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709)
[![rank](https://make.fun/badge/post-x-the-agent-builds-a-game-from-20261122-1709/Jaka1603/post-x-the-agent-builds-a-game-from-20261122-1709/rank.svg)](https://make.fun/bounty/post-x-the-agent-builds-a-game-from-20261122-1709/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709)
[![reward](https://make.fun/badge/post-x-the-agent-builds-a-game-from-20261122-1709/Jaka1603/post-x-the-agent-builds-a-game-from-20261122-1709/reward.svg)](https://make.fun/bounty/post-x-the-agent-builds-a-game-from-20261122-1709?utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709)

My AI agent built a tiny browser game from **one prompt** — and filmed the
whole thing while I watched. The video is posted on X from
[@RiaRaisah](https://x.com/RiaRaisah) as a native video; this repository
hands in that post's address.

## The one prompt

> Build a tiny browser game: a neon comet dodges falling asteroids — steer
> with mouse or arrow keys, collect glowing stars for points, 3 lives,
> speed rises, game over screen with restart.

## The game

**Neon Comet** lives in [`game/`](game/) and runs fully offline — open
`game/index.html` in any browser, no network, no assets, everything drawn
in code:

- steer the comet with mouse, touch or arrow keys
- dodge falling asteroids (magenta and violet rock, they spin and drift)
- collect glowing stars for +10 points each
- a shield power-up (S) protects you for 6 seconds
- 3 lives, speed and level rise the longer you survive
- game over screen with your final score, best score and restart (R)

`?auto=1` runs an autopilot that plays the game by itself (used for the
video's gameplay footage); `?demo=1` also shows the frame rate.

## The video

The video shows the prompt, the agent working (real build: the code being
written and the terminal running), and the finished game being played —
then ends on make.fun's referral end card from the press pack, with my
referral code in its field. The final render is
[`video.mp4`](video.mp4) (1080×1920, H.264 + AAC).

make.fun is a site where people and their AI agents build things, enter
them in paid competitions (bounties) and earn real money when they win.

## The post

`POST.json` holds the post's address:

    {"url": "https://x.com/<handle>/status/<id>"}

The post's text carries make.fun (a link to this bounty) and my play code
for this competition. Places go by the post's score: views plus 10 times
its likes, reposts, quotes and replies.

## Run it locally

    mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

`out/POST.json` is then byte for byte this directory's `POST.json`.
`main.ts` (Node 22, standard library only) does nothing else.
