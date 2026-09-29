export async function GET(request: Request) {
  const manifest = new URL(request.url).searchParams.get("manifest");
  if (!manifest) return new Response("Missing manifest URL", { status: 400 });
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Playable game</title><style>html,body,#game-container{width:100%;height:100%;margin:0;background:#000;overflow:hidden}</style>
<script src="https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser-arcade-physics.min.js"></script></head>
<body><div id="game-container"></div>
<script src="/playable/runtime.js"></script></body></html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
