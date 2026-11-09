import olefile, zlib, re, sys
def streams(p):
    f = olefile.OleFileIO(p); out={}
    for e in f.listdir(streams=True, storages=False):
        n="/".join(e); d=f.openstream(e).read(); k=d.find(b'x^')
        if n.startswith('RSeStorage/B') and k>=0:
            try: d=zlib.decompressobj().decompress(d[k:])
            except Exception: pass
        out[n]=d
    return out
if __name__=='__main__':
    st=streams(sys.argv[1]); pat=re.compile(rb'(?:[\x20-\x7e][\x00]){2,60}')
    for n,d in st.items():
        if sys.argv[2] in n:
            for m in pat.finditer(d):
                print(m.start(), repr(d[m.start()-8:m.start()]), m.group().decode('utf-16le'))
