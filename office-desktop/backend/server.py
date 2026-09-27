"""Office-Desktop backend server.

Menjalankan monitor proses desktop (psutil) dan menyiarkan snapshot
"keadaan kantor" ke frontend 3D lewat WebSocket di ws://localhost:8765/ws

Jalankan:
    python server.py            # data asli dari proses desktop
    python server.py --demo     # data simulasi (untuk dev / tanpa izin proses)
"""

import argparse
import asyncio
import json
import logging
import random
import time

import websockets

from monitor import ProcessMonitor, DESKS, FIRST_NAMES, ROLES, classify

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("office-server")

HOST, PORT = "127.0.0.1", 8765


# ---------------------------------------------------------------- demo mode
class DemoMonitor:
    """Simulasi karyawan supaya bisa dev tanpa memengaruhi mesin asli."""

    APPS = ["chrome.exe", "Code.exe", "discord.exe", "spotify.exe", "taskmgr.exe",
            "firefox.exe", "idea64.exe", "slack.exe", "steam.exe", "photoshop.exe",
            "terminal.exe", "outlook.exe", "vlc.exe", "explorer.exe", "blender.exe"]

    def __init__(self):
        self.emps = []
        for i in range(10):
            name = random.choice(self.APPS)
            self.emps.append({
                "pid": 10000 + i,
                "name": name,
                "nickname": random.choice(FIRST_NAMES),
                "category": classify(name),
                "role": random.choice(ROLES.get(classify(name), ROLES["other"])),
                "target": random.random() * 0.5,
                "busyness": random.random() * 0.5,
                "hue": random.randrange(360),
                "seat": None,
            })
        self.t0 = time.time()

    def _spawn(self):
        name = random.choice(self.APPS)
        cat = classify(name)
        return {"pid": random.randrange(20000, 99999), "name": name,
                "nickname": random.choice(FIRST_NAMES), "category": cat,
                "role": random.choice(ROLES.get(cat, ROLES["other"])),
                "target": random.random(), "busyness": 0.0,
                "hue": random.randrange(360), "seat": None}

    def tick(self):
        if random.random() < 0.04 and len(self.emps) < 40:
            self.emps.append(self._spawn())
        if random.random() < 0.03 and len(self.emps) > 4:
            self.emps.pop(random.randrange(len(self.emps)))
        for e in self.emps:
            if random.random() < 0.05:
                e["target"] = min(1.0, max(0.0, e["target"] + random.uniform(-0.5, 0.5)))
            e["busyness"] += 0.15 * (e["target"] - e["busyness"])

        from monitor import CELL
        n_side = int(len(DESKS) ** 0.5)
        half_w = n_side * CELL / 2.0
        seats = []
        for dx, dy in DESKS:
            ccx = dx * CELL - half_w + CELL / 2
            ccz = dy * CELL - half_w + CELL / 2
            for i in range(4):
                side = 1 if i < 2 else -1
                off = -0.85 if i % 2 == 0 else 0.85
                seats.append(((dx, dy), (round(ccx + off, 2), round(ccz + side * 1.15, 2))))
        workers = []
        for idx, e in enumerate(self.emps):
            seat = seats[idx] if idx < len(seats) else None
            workers.append({
                "pid": e["pid"], "name": e["name"],
                "displayName": f'{e["name"].split(".")[0]} #{e["pid"]}',
                "nickname": e["nickname"], "category": e["category"],
                "role": e["role"],
                "cpu": round(e["busyness"] * (6 + 18 * random.Random(e["pid"]).random()), 2),
                "memMb": round(80 + e["busyness"] * 900, 1),
                "threads": int(1 + e["busyness"] * 12),
                "busyness": round(e["busyness"], 3), "hue": e["hue"],
                "desk": seat[0] if seat else None,
                "seat": seat[1] if seat else None,
                "uptime": round(time.time() - self.t0, 1),
            })
        load = min(100, sum(w["busyness"] for w in workers) * 8)
        return {"t": time.time(), "cpuLoad": round(load, 1),
                "memPercent": round(40 + load * 0.4, 1),
                "totalWorkers": len(workers),
                "busyWorkers": sum(1 for w in workers if w["busyness"] > 0.35),
                "workers": workers}


async def broadcast(monitor, interval):
    clients = set()
    async def handler(ws):
        log.info("client terhubung (%s)", ws.remote_address)
        clients.add(ws)
        try:
            await ws.send(json.dumps({"type": "hello", "demo": interval != 1.0}))
            async for _ in ws:  # client tidak mengirim apa-apa; cukup jaga koneksi
                pass
        except websockets.ConnectionClosed:
            pass
        finally:
            clients.discard(ws)

    async def ticker():
        loop = asyncio.get_running_loop()
        while True:
            snap = await loop.run_in_executor(None, monitor.tick)
            msg = json.dumps({"type": "state", **snap})
            dead = []
            for ws in list(clients):
                try:
                    await ws.send(msg)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                clients.discard(ws)
            await asyncio.sleep(interval)

    async with websockets.serve(handler, HOST, PORT, max_size=2 ** 21):
        log.info('Office-Desktop server siap di ws://%s:%d/ws', HOST, PORT)
        await ticker()


def main():
    ap = argparse.ArgumentParser(description="Office-Desktop 3D simulator backend")
    ap.add_argument("--demo", action="store_true", help="pakai data simulasi, bukan proses asli")
    ap.add_argument("--interval", type=float, default=1.0, help="detik antar-snapshot")
    args = ap.parse_args()
    monitor = DemoMonitor() if args.demo else ProcessMonitor()
    interval = 0.2 if args.demo else args.interval
    asyncio.run(broadcast(monitor, interval))


if __name__ == "__main__":
    main()
