import olefile,zlib,struct,re
def inflate(raw):
    k=raw.find(b'x^'); return zlib.decompressobj().decompress(raw[k:])
def segments(path):
    """yield (name, B data, node list [(start,end)]) for each B stream with an M size table that fits."""
    f=olefile.OleFileIO(path); names=["/".join(e) for e in f.listdir(streams=True,storages=False)]
    for n in names:
        if not n.startswith('RSeStorage/B'): continue
        mn='RSeStorage/M'+n[len('RSeStorage/B'):]
        if mn not in names: continue
        try: B=inflate(f.openstream(n).read()); M=inflate(f.openstream(mn).read())
        except Exception: continue
        if len(M)<18: continue
        cnt=struct.unpack_from('<I',M,14)[0]
        if 18+4*cnt>len(M): continue
        sizes=[struct.unpack_from('<I',M,18+4*i)[0]&0x7fffffff for i in range(cnt)]
        hdr=len(B)-sum(sizes)-9*cnt
        yield n,B,M,sizes,hdr

class Seg:
    OFF = 1
    def __init__(self, B, sizes, hdr):
        self.B, self.sizes = B, sizes; self.st = []; pos = hdr
        for s in sizes: self.st.append(pos); pos += s + 9
    def body(self, r):
        i = r - self.OFF
        return self.B[self.st[i]:self.st[i] + self.sizes[i] + 9]
    def refs(self, r):
        d = self.body(r); n = len(self.sizes) + self.OFF
        return [struct.unpack_from('<I', d, k)[0] & 0x7fffffff for k in range(0, len(d) - 3)
                if d[k + 3] == 0x80 and (struct.unpack_from('<I', d, k)[0] & 0x7fffffff) < n]
    def text(self, r):
        return [m.group().decode('utf-16le') for m in re.finditer(rb'(?:[\x20-\x7e][\x00]){3,60}', self.body(r))]
    def find_text(self, pattern):
        out = {}
        for m in re.finditer(rb'(?:[\x20-\x7e][\x00]){3,60}', self.B):
            s = m.group().decode('utf-16le')
            if re.fullmatch(pattern, s):
                import bisect; out.setdefault(s, bisect.bisect_right(self.st, m.start()) - 1 + self.OFF)
        return out
