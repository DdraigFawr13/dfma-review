"""Scratch decoder for the ACIS binary (SAB) B-rep embedded in Inventor .ipt files. Written from the bytes seen in
the NIST files; not complete. Records: tagged values, each record ends with tag 0x11."""
import struct, zlib, olefile

def streams(path):
    f = olefile.OleFileIO(path)
    for e in f.listdir(streams=True, storages=False):
        n = '/'.join(e)
        if n.startswith('RSeStorage/B'):
            raw = f.openstream(n).read()
            try: yield n, zlib.decompressobj().decompress(raw[raw.find(b"x^"):])
            except Exception: pass

def records(d, start):
    """Parse records from offset `start` (the 0x0d tag of 'asmheader'). Returns list of (name, values)."""
    i, recs, cur, name = start, [], [], None
    while i < len(d):
        t = d[i]; i += 1
        if t == 0x11:
            recs.append((name, cur)); cur, name = [], None
            if recs[-1][0] and recs[-1][0].startswith('End-of'): break
            continue
        if t in (0x0d, 0x0e, 0x07, 0x12):
            n = d[i]; s = d[i+1:i+1+n].decode('latin1'); i += 1 + n
            if t in (0x0d, 0x0e) and not cur:
                name = s if name is None else name + '-' + s
                if name.endswith('End-of-ASM-data'): recs.append((name, cur)); return recs
            else:
                cur.append(('s', s))
            continue
        if t == 0x08:
            n = struct.unpack_from('<H', d, i)[0]; cur.append(('s', d[i+2:i+2+n].decode('latin1'))); i += 2 + n; continue
        if t == 0x09:
            n = struct.unpack_from('<I', d, i)[0]; cur.append(('s', d[i+4:i+4+n].decode('latin1'))); i += 4 + n; continue
        if t == 0x04 or t == 0x15: cur.append(('i', struct.unpack_from('<i', d, i)[0])); i += 4; continue
        if t == 0x0c: cur.append(('p', struct.unpack_from('<i', d, i)[0])); i += 4; continue
        if t == 0x06: cur.append(('d', struct.unpack_from('<d', d, i)[0])); i += 8; continue
        if t in (0x13, 0x14): cur.append(('v', struct.unpack_from('<3d', d, i))); i += 24; continue
        if t == 0x16: cur.append(('v2', struct.unpack_from('<2d', d, i))); i += 16; continue
        if t == 0x03: cur.append(('i', struct.unpack_from('<h', d, i)[0])); i += 2; continue
        if t == 0x02: cur.append(('i', d[i])); i += 1; continue
        if t == 0x05: cur.append(('d', struct.unpack_from('<f', d, i)[0])); i += 4; continue
        if t in (0x0a, 0x0b): cur.append(('b', t == 0x0a)); continue
        if t in (0x0f, 0x10): cur.append(('{' if t == 0x0f else '}', None)); continue
        raise ValueError(f"unknown tag 0x{t:02x} at {i-1}, record {len(recs)} {name}")
    return recs

def models(path):
    for n, d in streams(path):
        k = d.find(b'\x0d\x09asmheader')
        if k >= 0:
            yield n, records(d, k)
