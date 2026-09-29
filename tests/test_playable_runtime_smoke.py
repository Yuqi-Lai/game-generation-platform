from __future__ import annotations

import functools
import hashlib
import http.server
import json
import os
import shutil
import socketserver
import subprocess
import tempfile
import threading
import unittest
import urllib.parse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "legacy" / "playrpg" / "game"
SAMPLE_ASSETS = ROOT / "legacy" / "playrpg" / "test01" / "assets"
MAC_CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


class PlayableRuntimeSmokeTest(unittest.TestCase):
    def test_v1_manifest_assets_resolve_and_phaser_creates_canvas(self):
        runtime_source = (RUNTIME / "game.js").read_text(encoding="utf-8")
        self.assertEqual(
            (ROOT / "apps" / "web" / "public" / "playable" / "runtime.js").read_bytes(),
            (RUNTIME / "game.js").read_bytes(),
            "the platform runtime copy must stay byte-for-byte aligned with the preserved Phaser runtime",
        )
        self.assertIn("pixelArt: true", runtime_source)
        self.assertIn("PLAYABLE_MANIFEST_REQUESTED", runtime_source)
        self.assertIn("width: 2048, height: 1152", runtime_source)
        self.assertIn("const ACTOR_DISPLAY_HEIGHT = 128", runtime_source)
        self.assertIn("function setActorFootprint(actor)", runtime_source)
        self.assertIn("function addGroundShadow(scene, actor)", runtime_source)
        self.assertIn("actor.setDepth(actor.y)", runtime_source)
        self.assertIn("function setupAtmosphere()", runtime_source)
        self.assertIn("Phaser.BlendModes.SCREEN", runtime_source)
        self.assertIn("building.body.updateFromGameObject()", runtime_source)
        self.assertIn("obstacleCollider = this.physics.add.collider(player, obstacles)", runtime_source)
        self.assertIn("Background display size must match playable world coordinates", runtime_source)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copy2(RUNTIME / "index.html", root / "index.html")
            shutil.copy2(RUNTIME / "game.js", root / "game.js")
            objects = root / "objects"
            objects.mkdir()
            sources = {
                "player.stand": SAMPLE_ASSETS / "temp_stand.png",
                "player.down": SAMPLE_ASSETS / "temp_down.png",
                "player.up": SAMPLE_ASSETS / "temp_up.png",
                "player.right": SAMPLE_ASSETS / "temp_right.png",
                "player.avatar": SAMPLE_ASSETS / "player_avatar.png",
                "scene.workshop.background": SAMPLE_ASSETS / "background_scene_0.png",
            }
            dimensions = {
                "player.stand": (128, 128),
                "player.down": (384, 128),
                "player.up": (384, 128),
                "player.right": (384, 128),
                "player.avatar": (673, 739),
                "scene.workshop.background": (2560, 1440),
            }
            descriptors = []
            for asset_id, source in sources.items():
                destination = objects / f"{asset_id}.png"
                shutil.copy2(source, destination)
                descriptors.append({
                    "id": asset_id,
                    "role": "SCENE_BACKGROUND" if asset_id.startswith("scene.") else "PLAYER_DIRECTION",
                    "objectKey": f"objects/{destination.name}",
                    "contentType": "image/png",
                    "width": dimensions[asset_id][0],
                    "height": dimensions[asset_id][1],
                    "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
                })

            handler = functools.partial(QuietHandler, directory=root)
            with socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler) as server:
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                base_url = f"http://127.0.0.1:{server.server_address[1]}/"
                manifest = {
                    "version": "playable-game-content/v1",
                    "title": "Synthetic Workshop",
                    "openingRemarks": "",
                    "style": {"artDirection": "Synthetic", "palette": ["teal", "brass", "cream"], "worldDescription": "Workshop"},
                    "world": {"width": 2560, "height": 1440, "tileSize": 64},
                    "assetBaseUrl": base_url,
                    "player": {
                        "id": "ari", "name": "Ari", "description": "Green coat",
                        "stats": {"hp": 100, "attack": 10, "defense": 10},
                        "assets": {
                            "stand": "player.stand", "down": "player.down", "up": "player.up",
                            "right": "player.right", "avatar": "player.avatar",
                            "frameWidth": 128, "frameHeight": 128, "frameCount": 3,
                        },
                    },
                    "npcs": [], "minions": [],
                    "scenes": [{
                        "id": "workshop", "title": "Workshop", "location": "Workshop", "objective": "Repair beacon",
                        "npcIds": [], "minionIds": [], "dialogue": [],
                        "playerSpawn": {"x": 128, "y": 720}, "exit": {"x": 2432, "y": 720},
                        "collisionRectangles": [{"x": 700, "y": 200, "width": 300, "height": 300}],
                        "backgroundAssetId": "scene.workshop.background",
                    }],
                    "assets": descriptors,
                }
                (root / "playable-manifest.v1.json").write_text(json.dumps(manifest), encoding="utf-8")

                for asset in manifest["assets"]:
                    self.assertTrue((root / asset["objectKey"]).is_file())
                self.assertEqual(manifest["world"], {"width": 2560, "height": 1440, "tileSize": 64})
                self.assertEqual(manifest["player"]["assets"]["frameCount"], 3)

                browser = os.environ.get("PLAYABLE_BROWSER_BIN")
                if not browser and MAC_CHROME.is_file():
                    browser = str(MAC_CHROME)
                if not browser:
                    self.skipTest("Set PLAYABLE_BROWSER_BIN to execute the browser portion")
                url = f"{base_url}index.html?manifest={urllib.parse.quote(base_url + 'playable-manifest.v1.json', safe='')}"
                result = subprocess.run(
                    [browser, "--headless=new", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=8000", "--dump-dom", url],
                    capture_output=True, text=True, timeout=30, check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("<canvas", result.stdout)
                self.assertIn('data-collision-bodies="1"', result.stdout)
                self.assertIn('data-player-collision-bound="true"', result.stdout)
                self.assertIn('data-playable-viewport="2048x1152"', result.stdout)
                server.shutdown()
                thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
