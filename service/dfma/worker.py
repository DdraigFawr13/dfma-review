"""One long-lived worker process for analyses (spec Flow step 3).

Started with the `spawn` method so pythonocc is imported once per worker. One job runs at a
time behind a lock. Past the time limit the worker is terminated, a new one is started, and
AnalysisTimeout is raised.
"""

from __future__ import annotations

import multiprocessing as mp
import threading
import traceback
from pathlib import Path

from . import settings
from .errors import ReadError


class AnalysisTimeout(Exception):
    def __init__(self) -> None:
        super().__init__(settings.MSG_TOO_LONG)


def _serve(conn) -> None:
    from .analyze import analyze  # the slow pythonocc import happens here, once

    conn.send(("ready", None))
    while True:
        try:
            job = conn.recv()
        except EOFError:
            return
        if job is None:
            return
        try:
            conn.send(("ok", analyze(*job)))
        except ReadError as exc:
            conn.send(("read_error", str(exc)))
        except Exception:
            conn.send(("error", traceback.format_exc()))


class Worker:
    def __init__(self) -> None:
        self._ctx = mp.get_context("spawn")
        self._lock = threading.Lock()
        self._proc = None
        self._conn = None

    def start(self) -> None:
        """Start the process and wait until pythonocc is imported."""
        with self._lock:
            self._start()

    def _start(self) -> None:
        if self._proc is not None and self._proc.is_alive():
            return
        parent, child = self._ctx.Pipe()
        proc = self._ctx.Process(target=_serve, args=(child,), name="dfma-worker", daemon=True)
        proc.start()
        child.close()
        try:
            kind, _ = parent.recv()
        except EOFError:
            proc.join(5)
            raise RuntimeError(f"the analysis worker failed to start (exit code {proc.exitcode}); "
                               "check that the dfma environment is active") from None
        if kind != "ready":
            raise RuntimeError(f"the analysis worker sent {kind!r} instead of ready")
        self._proc, self._conn = proc, parent

    def _kill(self) -> None:
        if self._proc is not None:
            self._proc.terminate()
            self._proc.join(5)
            if self._proc.is_alive():
                self._proc.kill()
                self._proc.join()
        if self._conn is not None:
            self._conn.close()
        self._proc = self._conn = None

    def stop(self) -> None:
        with self._lock:
            if self._conn is not None:
                try:
                    self._conn.send(None)
                    self._proc.join(5)
                except (OSError, ValueError):
                    pass
            self._kill()

    def run(self, path: str | Path, name: str, process: str, material: str,
            time_limit_s: float = settings.TIME_LIMIT_S) -> dict:
        with self._lock:
            self._start()
            self._conn.send((str(path), name, process, material))
            if not self._conn.poll(time_limit_s):
                self._kill()
                self._start()
                raise AnalysisTimeout()
            try:
                kind, value = self._conn.recv()
            except EOFError:  # the worker died (out of memory, a crash in OpenCascade)
                self._kill()
                self._start()
                raise RuntimeError("the analysis worker stopped unexpectedly") from None
        if kind == "ok":
            return value
        if kind == "read_error":
            raise ReadError(value)
        raise RuntimeError(value)


_default = Worker()


def default_worker() -> Worker:
    return _default


def run_analysis(path: str | Path, name: str, process: str, material: str,
                 time_limit_s: float = settings.TIME_LIMIT_S) -> dict:
    return _default.run(path, name, process, material, time_limit_s)
