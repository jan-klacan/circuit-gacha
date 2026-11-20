import json
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from http.client import HTTPConnection
from pathlib import Path
from random import Random
from tempfile import TemporaryDirectory
from threading import Thread
import unittest
from unittest.mock import patch
from uuid import uuid4

import server


class AlbumTestCase(unittest.TestCase):
    def setUp(self):
        folder = TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.save = Path(folder.name) / "album.json"
        save_override = patch.object(server, "SAVE", self.save)
        save_override.start()
        self.addCleanup(save_override.stop)


class PackTests(AlbumTestCase):
    def test_draws_belong_to_selected_pack_and_final_card_is_featured(self):
        rng = Random(42)
        for pack in server.POOLS:
            for _ in range(100):
                cards = [server.CARDS[card_id] for card_id in server.draw_cards(pack, rng)]
                self.assertEqual(len(cards), server.PACK_SIZE)
                self.assertTrue(all(card["set"] == pack for card in cards))
                self.assertNotEqual(cards[-1]["rarity"], "Common")

    def test_draw_only_repeats_when_the_rarity_pool_runs_out(self):
        rng = Random(42)
        with patch.dict(server.SLOT_ODDS, {slot: (("Legendary",), (100,)) for slot in server.SLOT_ODDS}):
            drawn = server.draw_cards("electrical", rng)
        self.assertNotEqual(drawn[0], drawn[1])
        self.assertEqual(set(drawn), set(server.POOLS["electrical"]["Legendary"]))

    def test_concurrent_retries_return_the_same_pack_and_save_once(self):
        request_id = str(uuid4())
        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(lambda _: server.open_pack("electrical", request_id), range(8)))
        self.assertTrue(all(result == results[0] for result in results))
        album = server.load_album()
        self.assertEqual(album["packsOpened"], 1)
        self.assertEqual(sum(card["count"] for card in album["cards"].values()), server.PACK_SIZE)

    def test_request_id_cannot_be_reused_for_another_pack(self):
        request_id = str(uuid4())
        server.open_pack("electrical", request_id)
        original = self.save.read_bytes()
        with self.assertRaises(server.ReceiptConflict):
            server.open_pack("quantum", request_id)
        self.assertEqual(self.save.read_bytes(), original)

    def test_failed_save_keeps_previous_album_and_retry_can_succeed(self):
        server.open_pack("electrical", str(uuid4()))
        original = self.save.read_bytes()
        request_id = str(uuid4())
        with patch.object(Path, "replace", side_effect=OSError("Save failed")):
            with self.assertRaises(OSError):
                server.open_pack("electrical", request_id)
        self.assertEqual(self.save.read_bytes(), original)
        self.assertEqual(list(self.save.parent.iterdir()), [self.save])
        result = server.open_pack("electrical", request_id)
        self.assertEqual(result["album"]["packsOpened"], 2)

    def test_unrecognized_album_is_preserved(self):
        original = json.dumps({"version": 1, "packsOpened": 3, "cards": {}, "receipts": []})
        self.save.write_text(original, encoding="utf-8")
        with self.assertRaises(ValueError):
            server.open_pack("electrical", str(uuid4()))
        self.assertEqual(self.save.read_text(encoding="utf-8"), original)


class HttpCacheTests(AlbumTestCase):
    def setUp(self):
        super().setUp()
        httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        self.port = httpd.server_port
        self.addCleanup(httpd.server_close)
        thread = Thread(target=httpd.serve_forever, kwargs={"poll_interval": 0.01})
        thread.start()
        self.addCleanup(thread.join)
        self.addCleanup(httpd.shutdown)

    def request(self, path, *, method="GET", headers=None, body=None):
        connection = HTTPConnection("127.0.0.1", self.port, timeout=2)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, response.headers, response.read()
        finally:
            connection.close()

    def test_static_routes_use_their_content_hash_as_validator(self):
        for path in server.ASSETS:
            with self.subTest(path=path):
                status, headers, payload = self.request(path)
                self.assertEqual(status, 200)
                self.assertEqual(headers["Cache-Control"], "no-cache")
                tag = headers["ETag"]
                self.assertEqual(tag, f'"{sha256(payload).hexdigest()}"')
                status, headers, body = self.request(path, headers={"If-None-Match": f'"old,tag", W/{tag}'})
                self.assertEqual((status, body), (304, b""))
                self.assertEqual(headers["ETag"], tag)
                self.assertEqual(headers["Cache-Control"], "no-cache")

    def test_stale_asset_tag_returns_current_content_and_head_has_no_body(self):
        status, headers, body = self.request("/app.js", headers={"If-None-Match": '"old"'})
        self.assertEqual(status, 200)
        status, head_headers, head_body = self.request("/app.js", method="HEAD")
        self.assertEqual((status, head_body), (200, b""))
        self.assertEqual(head_headers["Content-Length"], str(len(body)))
        self.assertEqual(head_headers["ETag"], headers["ETag"])
        status, _, body = self.request("/app.js", method="HEAD", headers={"If-None-Match": "*"})
        self.assertEqual((status, body), (304, b""))

    def test_album_and_opening_responses_are_never_cached(self):
        status, headers, body = self.request("/api/album", headers={"If-None-Match": "*"})
        self.assertEqual(status, 200)
        self.assertEqual(headers["Cache-Control"], "private, no-store")
        self.assertNotIn("ETag", headers)
        self.assertEqual(json.loads(body)["packsOpened"], 0)

        status, headers, body = self.request(
            "/api/open", method="POST", headers={"Content-Type": "application/json"},
            body=json.dumps({"pack": "electrical", "requestId": str(uuid4())}),
        )
        self.assertEqual(status, 200)
        self.assertEqual(headers["Cache-Control"], "private, no-store")
        self.assertNotIn("ETag", headers)
        self.assertEqual(len(json.loads(body)["pulls"]), server.PACK_SIZE)

        status, _, body = self.request("/api/album", headers={"If-None-Match": "*"})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["packsOpened"], 1)
        status, headers, _ = self.request("/album.json")
        self.assertEqual(status, 404)
        self.assertEqual(headers["Cache-Control"], "private, no-store")
