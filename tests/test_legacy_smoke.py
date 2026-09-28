from __future__ import annotations

import importlib.util
import json
import os
import socketserver
import threading
import unittest
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LEGACY = ROOT / "legacy" / "playrpg"


def load_legacy_server():
    spec = importlib.util.spec_from_file_location("legacy_server", LEGACY / "server.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load the relocated legacy server")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class QuietHandlerMixin:
    def log_message(self, format, *args):
        pass


class LegacyDemoSmokeTest(unittest.TestCase):
    def test_relocated_application_serves_the_existing_playable_demo(self):
        legacy_server = load_legacy_server()

        class QuietHandler(QuietHandlerMixin, legacy_server.RPGRequestHandler):
            pass

        previous_directory = Path.cwd()
        httpd = None
        thread = None
        try:
            os.chdir(LEGACY)
            socketserver.ThreadingTCPServer.allow_reuse_address = True
            httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), QuietHandler)
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            base_url = f"http://127.0.0.1:{httpd.server_address[1]}"

            with urllib.request.urlopen(f"{base_url}/", timeout=5) as response:
                homepage = response.read().decode("utf-8")
            self.assertIn("PlayRPG", homepage)
            self.assertIn("home.js", homepage)

            with urllib.request.urlopen(f"{base_url}/api/games", timeout=5) as response:
                projects = json.loads(response.read().decode("utf-8"))
            project_names = {project["name"] for project in projects}
            self.assertIn("test01", project_names)
            self.assertIn("harry_potter", project_names)

            with urllib.request.urlopen(
                f"{base_url}/test01/index.html", timeout=5
            ) as response:
                game_page = response.read().decode("utf-8")
            self.assertIn("game.js", game_page)

            with urllib.request.urlopen(
                f"{base_url}/test01/game_data.json", timeout=5
            ) as response:
                game_data = json.loads(response.read().decode("utf-8"))
            self.assertGreater(len(game_data), 0)
            self.assertTrue((LEGACY / "test01" / "assets").is_dir())
        finally:
            if httpd is not None:
                httpd.shutdown()
                httpd.server_close()
            if thread is not None:
                thread.join(timeout=5)
            os.chdir(previous_directory)


if __name__ == "__main__":
    unittest.main()
