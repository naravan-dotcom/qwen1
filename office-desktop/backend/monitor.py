"""Monitor proses desktop -> data "karyawan" untuk simulasi kantor 3D.

Setiap aplikasi yang berjalan di desktop dianggap sebagai karyawan:
- nama proses  -> nama karyawan (diberi nama orang agar lucu)
- % CPU        -> tingkat kesibukan (work intensity)
- RSS memory   -> "beban kerja" di meja
- jumlah thread-> berapa "tangan" yang dipakai bekerja :)
"""

import os
import random
import time

import psutil

# Kategori pekerjaan berdasarkan nama proses (lowercase substring).
CATEGORIES = [
    ("browser", ["chrome", "firefox", "edge", "brave", "opera", "safari", "chromium", "webkit"]),
    ("ide", ["code", "idea", "pycharm", "webstorm", "goland", "clion", "sublime", "atom",
             "cursor", "windsurf", "devenv", "studio", "eclipse", "neovim", "nvim", "vim", "emacs"]),
    ("terminal", ["terminal", "cmd", "powershell", "pwsh", "bash", "zsh", "fish", "conhost",
                  "windowsterminal", "alacritty", "kitty", "wezterm"]),
    ("communication", ["slack", "discord", "telegram", "whatsapp", "teams", "zoom", "meet",
                       "outlook", "thunderbird", "mail"]),
    ("media", ["vlc", "spotify", "music", "mpv", "itunes", "winamp", "mpc", "potplayer"]),
    ("design", ["figma", "photoshop", "illustrator", "blender", "gimp", "inkscape", "canva",
                "premiere", "afterfx", "davinci", "paint"]),
    ("documents", ["word", "excel", "powerpnt", "soffice", "libreoffice", "calc", "writer",
                   "impress", "acrobat", "sumatrapdf", "pdf"]),
    ("game", ["steam", "epic", "minecraft", "league", "valorant", "game", "rocket", "elden"]),
    ("security", ["defender", "antivirus", "firewall", "malware", "security", "updater"]),
    ("system", ["system", "service", "daemon", "agent", "kernel", "init", "svchost", "csrss",
                "winlogon", "explorer", "dwm", "spoolsv", "taskhost", "runtime", "session",
                "dbus", "udev", "journal", "login", "gvfs", "pipewire", "pulseaudio", "xfce",
                "gnome", "kde", "plasma", "windows", "microsoft", "one drive", "onedrive"]),
]

ROLES = {
    "browser": ["Web Surfer", "Tab Hoarder", "Link Analyst"],
    "ide": ["Code Wizard", "Bug Exterminator", "Refactor Ninja"],
    "terminal": ["Shell Operator", "CLI Wrangler", "Pipe Master"],
    "communication": ["Meeting Rep", "Chat Ambassador", "Email Courier"],
    "media": ["DJ Intern", "Vibe Curator", "Headbanger Jr."],
    "design": ["Pixel Artist", "Layer Tamer", "Color Whisperer"],
    "documents": ["Paper Pusher", "Spreadsheet Monk", "Slide Smith"],
    "game": ["Escapism Consultant", "Side Quest Manager", "Loot Auditor"],
    "security": ["Hall Monitor", "Firewall Guard", "Patch Keeper"],
    "system": ["Facility Janitor", "Server Butler", "Infrastructure Clerk"],
    "other": ["Office Intern", "General Worker", "Desk Occupant"],
}

FIRST_NAMES = [
    "Budi", "Siti", "Joko", "Rina", "Andi", "Dewi", "Agus", "Maya", "Tono", "Lina",
    "Bagas", "Citra", "Doni", "Eka", "Fajar", "Gita", "Hadi", "Indah", "Joni", "Kiki",
    "Luki", "Mira", "Nanda", "Oki", "Putri", "Qori", "Rizky", "Sari", "Taufik", "Umi",
    "Wawan", "Yuni", "Zaki", "Ayu", "Bayu", "Cahya", "Dimas", "Elma", "Farhan", "Galih",
]

DESKS = [(0, 0), (1, 0), (2, 0), (3, 0),
         (0, 1), (1, 1), (2, 1), (3, 1),
         (0, 2), (1, 2), (2, 2), (3, 2),
         (0, 3), (1, 3), (2, 3), (3, 3)]

CELL = 4  # meter, harus sama dengan web/js/factory.js

MAX_WORKERS = len(DESKS) * 4  # sampai 64 kursi; sisanya nongkrong di pantry


def classify(name: str):
    low = name.lower()
    for cat, keys in CATEGORIES:
        for k in keys:
            if k in low:
                return cat
    return "other"


class Employee:
    """Representasi satu proses sebagai karyawan dengan nilai yang di-smooth."""

    def __init__(self, pid, name, exe_path):
        self.pid = pid
        self.raw_name = name
        base = name.split(".")[0].replace("-", " ").replace("_", " ").strip().title() or name
        self.display_name = f"{base} #{pid}"
        self.nickname = FIRST_NAMES[(pid * 31 + len(name) * 7) % len(FIRST_NAMES)]
        self.category = classify(name)
        self.role = random.choice(ROLES.get(self.category, ROLES["other"]))
        self.cpu = 0.0
        self.mem_mb = 0.0
        self.threads = 1
        self.busyness = 0.0  # 0..1, sudah dinormalisasi & di-smooth
        self.since = time.time()
        rng = random.Random(pid * 7919 + hash(name) % 1000)
        self.hue = rng.randrange(0, 360)
        self.desk = None

    def update(self, cpu, mem_mb, threads):
        self.cpu = cpu
        self.mem_mb = mem_mb
        self.threads = threads
        # busyness: gabungan CPU (skala ~25% = sibuk penuh) dan memori (skala ~1GB)
        target = min(1.0, 0.85 * (cpu / 25.0) + 0.15 * min(1.0, mem_mb / 1024.0))
        self.busyness += 0.25 * (target - self.busyness)  # exponential smoothing

    def to_dict(self):
        return {
            "pid": self.pid,
            "name": self.raw_name,
            "displayName": self.display_name,
            "nickname": self.nickname,
            "category": self.category,
            "role": self.role,
            "cpu": round(self.cpu, 2),
            "memMb": round(self.mem_mb, 1),
            "threads": self.threads,
            "busyness": round(self.busyness, 3),
            "hue": self.hue,
            "desk": self.desk,
            "uptime": round(time.time() - self.since, 1),
        }


class ProcessMonitor:
    SELF_PIDS = {os.getpid()}

    def __init__(self):
        self._procs = {}          # pid -> psutil.Process
        self._last_cpu = {}       # pid -> (t_last, cpu_last)
        self._employees = {}      # pid -> Employee
        self._prev_ids = set()
        self._snapshot = None     # snapshot terakhir dari psutil
        self._load = 0.0
        self.touch_all()

    # ---------- util ----------
    @staticmethod
    def _is_visible(p, info):
        """Hanya proses 'nyata' yang mau kita pekerjakan."""
        name = (info.get("name") or "").lower()
        if not name:
            return False
        # current python process & shell tools tidak dihitung jadi karyawan
        if name.startswith(("python", "node", "npm", "bash", "sh.exe")) and \
                any(x in name for x in ("python", "node", "bash")):
            # izinkan kalau memang app desktop bernama mirip? di dev ini mengecualikan diri sendiri
            pass
        try:
            status = p.status()
            if status in (psutil.STATUS_ZOMBIE, psutil.STATUS_DEAD, psutil.STATUS_STOPPED):
                return False
        except Exception:
            return False
        try:
            rss = info.get("memory_info").rss if info.get("memory_info") else 0
        except Exception:
            rss = 0
        return rss > 8 * 1024 * 1024  # > 8 MB, saring kernel threads & noise

    def touch_all(self):
        """Panggil cpu_percent(interval=None) utk semua proses agar delta terisi."""
        try:
            procs = list(psutil.process_iter(["pid", "name"]))
        except Exception:
            return
        for p in procs:
            try:
                p.cpu_percent(None)
            except Exception:
                pass

    def sample_processes(self):
        try:
            snap = list(psutil.process_iter(["pid", "name", "memory_info", "num_threads"]))
        except Exception:
            return []
        out = []
        now = time.time()
        for p in snap:
            try:
                info = p.info
                pid = info["pid"]
                if pid in self.SELF_PIDS or pid == os.getppid():
                    continue
                if not self._is_visible(p, info):
                    continue
                raw = p.cpu_percent(None)
                # normalisasi per-core: bagi jumlah core lalu skala ke 0..100-ish
                norm = raw / max(1, psutil.cpu_count() or 1) * 4.0
                prev_t, prev_v = self._last_cpu.get(pid, (now, 0.0))
                dt = max(0.1, now - prev_t)
                smooth = prev_v * 0.6 + norm * 0.4 if dt < 5 else norm
                self._last_cpu[pid] = (now, smooth)
                rss = info["memory_info"].rss if info["memory_info"] else 0
                out.append((p, info, smooth, rss / 1024 / 1024,
                            info["num_threads"] or 1))
            except (psutil.NoSuchProcess, psutil.AccessDenied, Exception):
                continue
        return out

    # ---------- main tick ----------
    def tick(self):
        samples = self.sample_processes()
        ids = {info["pid"] for _, info, _, _, _ in samples}
        gone = set(self._employees) - ids
        for pid in gone:
            emp = self._employees.pop(pid)
            if emp.desk is not None:
                pass  # desk akan di-reassign di bawah
        self._last_cpu = {k: v for k, v in self._last_cpu.items() if k in ids}

        # bangun/update employee
        emps = []
        for p, info, cpu, mem, thr in samples:
            pid = info["pid"]
            emp = self._employees.get(pid)
            if emp is None:
                emp = Employee(pid, info["name"], None)
                self._employees[pid] = emp
            emp.update(cpu, mem, thr)
            emps.append(emp)

        # daftar kursi fisik dlm koordinat dunia (meter). Satu sel meja punya 4 kursi:
        # 2 orang duduk menghadap baris meja utara (duduk di sisi +z, hadap -z),
        # 2 orang menghadap baris meja selatan (duduk di sisi -z, hadap +z).
        GRID_N = int(len(DESKS) ** 0.5)
        HALF_W = GRID_N * CELL / 2.0
        ALL_SEATS = []
        for dx, dy in DESKS:
            ccx = dx * CELL - HALF_W + CELL / 2
            ccz = dy * CELL - HALF_W + CELL / 2
            for i in range(4):
                side = 1 if i < 2 else -1          # kursi di sisi +z / -z meja
                off = -0.85 if i % 2 == 0 else 0.85
                sx = ccx + off
                sz = ccz + side * 1.15
                ALL_SEATS.append(((dx, dy), (round(sx, 2), round(sz, 2))))

        # sort by busyness; karyawan lama boleh mempertahankan kursinya
        emps.sort(key=lambda e: (-e.busyness, e.pid))
        occupied = set()
        for e in emps:
            if getattr(e, "seat", None) is not None:
                entry = next((s for s in ALL_SEATS if s[1] == tuple(e.seat)), None)
                if entry and id(entry) not in occupied:
                    occupied.add(id(entry))
                    e.desk, e.seat = entry
                    continue
            e.seat = None
            e.desk = None
        free_seats = [s for s in ALL_SEATS if id(s) not in occupied]
        fi = 0
        for e in emps:
            if e.seat is None:
                if fi < len(free_seats):
                    e.desk, e.seat = free_seats[fi]
                    fi += 1
                else:
                    e.desk = None  # penuh -> nongkrong di pantry (tanpa kursi)

        busy_count = sum(1 for e in emps if e.busyness > 0.35)
        total_workers = len(emps)
        workers = []
        for e in emps[:MAX_WORKERS]:
            d = e.to_dict()
            d["seat"] = getattr(e, "seat", (0, 0))
            workers.append(d)

        try:
            cpu_load = psutil.cpu_percent(None)
            self._load = self._load * 0.7 + cpu_load * 0.3
            mem = psutil.virtual_memory()
        except Exception:
            cpu_load, mem = 0, None

        return {
            "t": time.time(),
            "cpuLoad": round(self._load, 1),
            "memPercent": mem.percent if mem else 0,
            "totalWorkers": total_workers,
            "busyWorkers": busy_count,
            "workers": workers,
        }
