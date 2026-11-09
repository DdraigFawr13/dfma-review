"""FastAPI routes (spec Flow). The app calls only run_analysis; ReadError and
AnalysisTimeout become 422 {"error": message} (a timeout adds "retry": true); a file over 50 MB gets 413. An optional `ipt` (I1)
rides beside the STEP `file`."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import olefile
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import settings
from .errors import ReadError
from .worker import AnalysisTimeout, default_worker, run_analysis

ANALYZE_PATH = "/api/analyze"


class UploadLimit:
    """Refuse bodies over the limit: by Content-Length before reading, else by cutting the stream.

    Pure ASGI so it runs before the form is parsed. When the stream is cut, the app's own
    response (FastAPI answers 400 for a broken body) is replaced by the 413.
    """

    # The body is the file plus the multipart envelope (boundaries, headers, the other fields).
    ENVELOPE_BYTES = 64 * 1024

    def __init__(self, app, limit: int) -> None:
        self.app, self.limit = app, limit + self.ENVELOPE_BYTES

    async def _send_413(self, send) -> None:
        body = json.dumps({"error": settings.MSG_TOO_LARGE}).encode()
        await send({"type": "http.response.start", "status": 413,
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"] != ANALYZE_PATH:
            return await self.app(scope, receive, send)
        length = dict(scope["headers"]).get(b"content-length")
        if length is not None and length.isdigit() and int(length) > self.limit:
            return await self._send_413(send)

        received = 0
        too_large = False
        replaced = False

        async def limited_receive():
            nonlocal received, too_large
            msg = await receive()
            if msg["type"] == "http.request":
                received += len(msg.get("body", b""))
                if received > self.limit:
                    too_large = True
                    raise OSError("upload larger than the limit")
            return msg

        async def guarded_send(msg):
            nonlocal replaced
            if too_large:
                if not replaced:
                    replaced = True
                    await self._send_413(send)
                return
            await send(msg)

        try:
            await self.app(scope, limited_receive, guarded_send)
        except OSError:
            if not too_large:
                raise
        if too_large and not replaced:
            await self._send_413(send)


def _copy(upload: UploadFile, suffix: str, temps: list[str]) -> str:
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    temps.append(tmp.name)
    with tmp:
        shutil.copyfileobj(upload.file, tmp)
    return tmp.name


def create_app(dist_dir: Path | None = settings.DIST_DIR) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app):
        default_worker().start()  # warm: pythonocc imported before the first upload
        yield
        default_worker().stop()

    app = FastAPI(title="DFMA Review", lifespan=lifespan)

    @app.post(ANALYZE_PATH)
    def analyze_upload(file: UploadFile = File(...), ipt: UploadFile | None = File(None),
                       process: str = Form("mill"), material: str = Form("al6061")):
        if process not in settings.PROCESSES:
            return JSONResponse({"error": f"Unknown process: {process}"}, status_code=422)
        if material not in settings.MATERIALS:
            return JSONResponse({"error": f"Unknown material: {material}"}, status_code=422)
        temps = []
        try:
            step_tmp = _copy(file, ".step", temps)
            ipt_tmp = _copy(ipt, ".ipt", temps) if ipt is not None else None
            if any(os.path.getsize(t) > settings.MAX_UPLOAD_BYTES for t in temps):  # each file on its own, no envelope
                return JSONResponse({"error": settings.MSG_TOO_LARGE}, status_code=413)
            if olefile.isOleFile(step_tmp):  # an .ipt (or another compound file) where the STEP goes (I1)
                return JSONResponse({"error": settings.MSG_IPT_NEEDS_STEP}, status_code=422)
            name = Path(file.filename or "upload.step").name
            ipt_name = Path(ipt.filename or "part.ipt").name if ipt is not None else None
            return run_analysis(step_tmp, name, process, material, ipt_tmp, ipt_name)
        except ReadError as exc:
            return JSONResponse({"error": str(exc)}, status_code=422)
        except AnalysisTimeout as exc:  # audit F3: trying again can help here, so the page offers it
            return JSONResponse({"error": str(exc), "retry": True}, status_code=422)
        except RuntimeError:  # the worker crashed or the analysis hit a bug; the worker restarts itself
            return JSONResponse({"error": settings.MSG_FAILED}, status_code=500)
        finally:
            for t in temps:
                os.unlink(t)  # nothing is kept (APP-01)

    if dist_dir is not None and Path(dist_dir).is_dir():
        app.mount("/", StaticFiles(directory=dist_dir, html=True), name="web")

    app.add_middleware(UploadLimit, limit=2 * settings.MAX_UPLOAD_BYTES)  # a STEP and its .ipt (I1)
    return app
