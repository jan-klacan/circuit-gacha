#!/usr/bin/env python3
"""Serve Circuit Draw and keep the album on this computer."""
import argparse
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
from secrets import SystemRandom
from tempfile import NamedTemporaryFile
from threading import Lock, Timer
from urllib.parse import urlsplit
from uuid import UUID
import webbrowser

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
SAVE = ROOT / "album.json"
ASSET_FILES = {
    "/": ("index.html", "text/html"),
    "/style.css": ("style.css", "text/css"),
    "/app.js": ("app.js", "text/javascript"),
    "/art.js": ("art.js", "text/javascript"),
    "/catalog.json": ("catalog.json", "application/json"),
}
ENTITY_TAG = re.compile(r'(?:^|,)[ \t]*(?:W/)?("[\x21\x23-\x7e\x80-\xff]*")[ \t]*(?=,|$)')


@dataclass(frozen=True)
class Asset:
    payload: bytes
    content_type: str
    etag: str


def load_assets(directory):
    assets = {}
    for url, (filename, content_type) in ASSET_FILES.items():
        payload = (directory / filename).read_bytes()
        assets[url] = Asset(payload, content_type, f'"{sha256(payload).hexdigest()}"')
    return assets


# Use the same release snapshot for the browser catalog and the draw pools.
ASSETS = load_assets(STATIC)
CATALOG = json.loads(ASSETS["/catalog.json"].payload)
CARDS = {card["id"]: card for card in CATALOG["cards"]}
ODDS = CATALOG["odds"]
PACK_SIZE = CATALOG["packSize"]
POOLS = {
    pack["id"]: {
        rarity: tuple(card["id"] for card in CARDS.values()
                      if card["set"] == pack["id"] and card["rarity"] == rarity)
        for rarity in ODDS["standard"]
    }
    for pack in CATALOG["packs"]
}
SLOT_ODDS = {
    slot: (tuple(odds), tuple(odds.values())) for slot, odds in ODDS.items()
}
LOCK = Lock()
RANDOM = SystemRandom()


def load_album():
    try:
        album = json.loads(SAVE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {"version": 1, "packsOpened": 0, "cards": {}, "receipts": {}}
    if not isinstance(album, dict) or album.get("version") != 1:
        raise ValueError("Unrecognized album format")
    if (type(album.get("packsOpened")) is not int or album["packsOpened"] < 0
            or not isinstance(album.get("cards"), dict) or not isinstance(album.get("receipts"), dict)):
        raise ValueError("Unrecognized album format")
    for entry in album["cards"].values():
        if (not isinstance(entry, dict) or type(entry.get("count")) is not int
                or entry["count"] < 1 or not isinstance(entry.get("firstFound"), str)):
            raise ValueError("Unrecognized card entry")
    return album


def save_album(album):
    temporary = None
    try:
        with NamedTemporaryFile(mode="w", encoding="utf-8", dir=SAVE.parent,
                                prefix=".album-", suffix=".tmp", delete=False) as handle:
            temporary = Path(handle.name)
            json.dump(album, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(SAVE)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def album_view(album):
    return {key: album[key] for key in ("version", "packsOpened", "cards")}


class ReceiptConflict(Exception):
    """The request ID already opened a different pack."""


def draw_cards(pack, rng):
    pools = POOLS[pack]
    drawn = []
    for slot in range(PACK_SIZE):
        rarities, weights = SLOT_ODDS["featured" if slot == PACK_SIZE - 1 else "standard"]
        rarity = rng.choices(rarities, weights=weights)[0]
        pool = pools[rarity]
        candidates = [card_id for card_id in pool if card_id not in drawn]
        drawn.append(rng.choice(candidates or pool))
    return drawn


def open_pack(pack, request_id):
    with LOCK:
        album = load_album()
        receipts = album["receipts"]
        if request_id in receipts:
            pulls = receipts[request_id]
            if not isinstance(pulls, list) or len(pulls) != PACK_SIZE or any(
                not isinstance(pull, dict) or type(pull.get("isNew")) is not bool for pull in pulls
            ):
                raise ValueError("Unrecognized pack receipt")
            if any(CARDS[pull["id"]]["set"] != pack for pull in pulls):
                raise ReceiptConflict
            return {"pulls": pulls, "album": album_view(album)}
        now = datetime.now(timezone.utc).isoformat()
        pulls = []
        for card_id in draw_cards(pack, RANDOM):
            is_new = card_id not in album["cards"]
            entry = album["cards"].setdefault(card_id, {"count": 0, "firstFound": now})
            entry["count"] += 1
            pulls.append({"id": card_id, "isNew": is_new})
        album["packsOpened"] += 1
        receipts[request_id] = pulls
        if len(receipts) > 100:
            del receipts[next(iter(receipts))]
        save_album(album)
        return {"pulls": pulls, "album": album_view(album)}


class Handler(BaseHTTPRequestHandler):
    def local_request(self):
        host = self.headers.get("Host")
        allowed = f"127.0.0.1:{self.server.server_port}"
        return host == allowed and self.headers.get("Origin") in (None, f"http://{allowed}")

    def send_data(self, status, payload, content_type, *, etag=None):
        self.send_response(status)
        if status != 304:
            self.send_header("Content-Type", f"{content_type}; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-cache" if etag else "private, no-store")
        if etag:
            self.send_header("ETag", etag)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'")
        self.end_headers()
        if self.command != "HEAD" and status != 304:
            self.wfile.write(payload)

    def send_json(self, status, data):
        self.send_data(status, json.dumps(data).encode("utf-8"), "application/json")

    def send_asset(self, asset):
        validators = ",".join(self.headers.get_all("If-None-Match", []))
        unchanged = validators.strip() == "*" or asset.etag in ENTITY_TAG.findall(validators)
        self.send_data(304 if unchanged else 200, asset.payload, asset.content_type, etag=asset.etag)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        if not self.local_request():
            return self.send_json(403, {"error": "Open the game using its local address."})
        path = urlsplit(self.path).path
        if path in ASSETS:
            return self.send_asset(ASSETS[path])
        if path == "/api/album":
            try:
                with LOCK:
                    album = album_view(load_album())
            except (OSError, ValueError, KeyError, TypeError, AttributeError):
                return self.send_json(500, {"error": "Could not read album.json. Check the file, then reload."})
            return self.send_json(200, album)
        self.send_json(404, {"error": "Page not found."})

    def do_POST(self):
        if not self.local_request():
            return self.send_json(403, {"error": "Open the game using its local address."})
        if urlsplit(self.path).path != "/api/open":
            return self.send_json(404, {"error": "Page not found."})
        try:
            size = int(self.headers.get("Content-Length", 0))
            if not 0 < size <= 1024 or self.headers.get_content_type() != "application/json":
                raise ValueError
            data = json.loads(self.rfile.read(size))
            pack = data["pack"]
            request_id = str(UUID(data["requestId"]))
            if not isinstance(pack, str) or pack not in POOLS:
                raise ValueError
        except (ValueError, KeyError, TypeError, AttributeError):
            return self.send_json(400, {"error": "Invalid pack request."})
        try:
            result = open_pack(pack, request_id)
        except ReceiptConflict:
            return self.send_json(409, {"error": "That opening already belongs to another pack."})
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            return self.send_json(500, {"error": "Could not save album.json. Check the game folder, then retry."})
        self.send_json(200, result)

    def log_message(self, format, *args):
        pass


@contextmanager
def exclusive_album():
    with (ROOT / ".album.lock").open("a+b") as lock:
        try:
            if os.name == "nt":
                import msvcrt
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise SystemExit("Could not lock the album. If the game is already running, use its open browser tab.") from error
        yield


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=0, help="Local port, default is automatically chosen")
    parser.add_argument("--no-browser", action="store_true", help="Print the address without launching a browser")
    args = parser.parse_args()
    with exclusive_album(), ThreadingHTTPServer(("127.0.0.1", args.port), Handler) as server:
        url = f"http://127.0.0.1:{server.server_port}"
        print(f"Circuit Draw  ·  {url}", flush=True)
        print(f"Album  ·  {SAVE}\nPress Ctrl+C to stop.", flush=True)
        if not args.no_browser:
            Timer(0.25, webbrowser.open, args=(url,)).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
