"""Open an Inventor .ipt (an OLE compound file) and inflate its model streams (spec I1 Design "Parts").

Every size is untrusted: each inflated stream is capped, and so is the file's total (D-031 safety rules).
"""

from __future__ import annotations

import zlib
from pathlib import Path

import olefile

from .. import settings
from ..errors import ReadError

STREAM_CAP = 64 * 1024 * 1024  # bytes per inflated stream; largest measured 2,536,828 (NIST, 2026-11-08)
FILE_CAP = 256 * 1024 * 1024  # bytes inflated per file
DESIGN_TRACKING = "\x05PypkizqiUjudbposAayal4qdGf"  # property 31: document subtype; 67: the saving build


class Ipt:
    """The compound file's streams, read once. Raises ReadError(MSG_IPT_NOT_IPT) on a file that is not one."""

    def __init__(self, path: str | Path):
        try:
            if not olefile.isOleFile(str(path)):
                raise ReadError(settings.MSG_IPT_NOT_IPT)
            self._f = olefile.OleFileIO(str(path))
        except ReadError:
            raise
        except Exception as e:  # olefile raises plain exceptions on a broken header or FAT
            raise ReadError(settings.MSG_IPT_NOT_IPT) from e
        self.names = ["/".join(e) for e in self._f.listdir(streams=True, storages=False)]

    def read(self, name: str) -> bytes:
        try:
            return self._f.openstream(name).read()
        except Exception as e:
            raise ReadError(settings.MSG_IPT_FORMAT.format(version="unknown")) from e

    def properties(self, name: str) -> dict:
        try:
            return self._f.getproperties(name)
        except Exception:
            return {}

    def models(self, stream_cap: int | None = None, file_cap: int | None = None) -> list[bytes]:
        """Inflate every `RSeStorage/B*` stream from its first zlib header `x^`; over a cap -> MSG_IPT_TOO_BIG."""
        stream_cap = STREAM_CAP if stream_cap is None else stream_cap
        file_cap = FILE_CAP if file_cap is None else file_cap
        out, total = [], 0
        for name in self.names:
            if not name.startswith("RSeStorage/B"):
                continue
            raw = self.read(name)
            k = raw.find(b"x^")
            if k < 0:
                continue
            z = zlib.decompressobj()
            try:
                data = z.decompress(raw[k:], stream_cap)
            except zlib.error:
                continue  # not a zlib stream after all; such streams carry no model
            if z.unconsumed_tail:
                raise ReadError(settings.MSG_IPT_TOO_BIG)
            total += len(data)
            if total > file_cap:
                raise ReadError(settings.MSG_IPT_TOO_BIG)
            out.append(data)
        return out

    def close(self) -> None:
        self._f.close()
