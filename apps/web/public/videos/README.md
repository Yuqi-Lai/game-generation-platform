# Game footage

Drop your clips here. They are picked up automatically — no code change.

| File | Where it appears |
| --- | --- |
| `hero-demo.mp4` | The hero showcase window |
| `hero-2.mp4` … `hero-4.mp4` | The worlds the mini preview cycles to |
| `bento-1.mp4` … `bento-4.mp4` | The four cards in section 03 |

Until a file is present the page falls back to a procedurally drawn pixel scene,
so nothing looks broken while you are still recording.

Labels and copy for each clip live in `components/landing/media.ts`.

Encode for crisp pixel art (nearest-neighbour upscale, no audio track):

```sh
ffmpeg -i in.mov -an -vf "scale=1280:-2:flags=neighbor" \
       -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart out.mp4
```

Keep clips muted, short (6–12s) and seamless — they autoplay on loop.

## Not in version control

`*.mp4` here is gitignored. The clips are tens of megabytes each and git keeps
binaries forever, so they are uploaded to the host straight from the working
tree instead. A fresh clone has no footage and falls back to the procedural
scene — copy the files in by hand, or fetch them from the last deploy.

`-movflags +faststart` in the command above is not optional for a file this
size: without it the `moov` atom lands after `mdat` and the browser has to
download the whole clip before the first frame can play.
