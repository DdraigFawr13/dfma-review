import sys, glob, collections
sys.path.insert(0, '/home/user/dfma-review/service')
from dfma.inventor import ole, sab
FILES = sorted(glob.glob('/home/user/dfma-review/tests/inventor/files/*.ipt'))
def short(p): 
    import os; n=os.path.basename(p); return n.replace('INV_nist_','').replace('_asme1','').replace('.ipt','')
def main_model(path):
    f = ole.Ipt(path); best=None
    try:
        for d in f.models():
            k = d.find(sab.HEADER)
            while k >= 0:
                v, recs = sab.split(d, k)
                n = sum(1 for r in recs if r.name == 'face')
                if best is None or n > best[1]: best=(recs,n)
                k = d.find(sab.HEADER, k+1)
    finally: f.close()
    return best[0]
