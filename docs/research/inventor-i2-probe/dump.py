import os, sys, json, traceback
import FreeCAD, FreeCADGui
from PySide import QtCore, QtGui
OUT=os.environ['KEY_OUT']; SRC=os.environ['KEY_IPT']; LOG=open(OUT+'.log','w')
def log(*a): LOG.write(' '.join(map(str,a))+'\n'); LOG.flush()
def answer():
    for w in QtGui.QApplication.topLevelWidgets():
        if isinstance(w, QtGui.QDialog) and w.isVisible():
            log('dialog', w.windowTitle()); w.done(2)
t=QtCore.QTimer(); t.timeout.connect(answer); t.start(500)
def val(v):
    if isinstance(v,(int,float,str,bool)) or v is None: return v
    if hasattr(v,'Value') and hasattr(v,'Unit'): return float(v.Value)
    if isinstance(v,(list,tuple)): return [val(x) for x in v][:200]
    if hasattr(v,'Name') and hasattr(v,'TypeId'): return 'obj:'+v.Name
    if hasattr(v,'x') and hasattr(v,'y') and hasattr(v,'z'): return [v.x,v.y,v.z]
    return str(v)[:200]
def run():
    try:
        log('types', FreeCAD.getImportType('ipt'))
        mod=FreeCAD.getImportType('ipt')[0]
        __import__(mod).insert(SRC, FreeCAD.newDocument('K').Name) if hasattr(__import__(mod),'insert') else __import__(mod).open(SRC)
        doc=FreeCAD.ActiveDocument; out=[]
        for o in doc.Objects:
            d={'Name':o.Name,'Label':o.Label,'TypeId':o.TypeId,'props':{}}
            for p in o.PropertiesList:
                if p in ('Shape','Placement','ExpressionEngine','Label2','Visibility'): continue
                try: d['props'][p]=val(getattr(o,p))
                except Exception as e: d['props'][p]='ERR'
            if o.TypeId=='PartDesign::Hole':
                try:
                    sk=o.Profile[0]; pl=sk.getGlobalPlacement(); pts=[]
                    for g in sk.Geometry:
                        if hasattr(g,'Center'): c=g.Center
                        elif hasattr(g,'X'): c=FreeCAD.Vector(g.X,g.Y,g.Z)
                        else: continue
                        q=pl.multVec(c); pts.append([q.x,q.y,q.z])
                    d['centres']=pts; d['normal']=val(pl.Rotation.multVec(FreeCAD.Vector(0,0,1)))
                except Exception as e: d['centres_err']=str(e)
            out.append(d)
        json.dump(out,open(OUT,'w'),indent=0); log('done',len(out))
    except Exception: log(traceback.format_exc())
    FreeCADGui.getMainWindow().close(); os._exit(0)
QtCore.QTimer.singleShot(1000, run)
