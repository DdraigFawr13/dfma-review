from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCC.Core.BRepFilletAPI import BRepFilletAPI_MakeFillet, BRepFilletAPI_MakeChamfer
from OCC.Core.TopExp import TopExp_Explorer
from OCC.Core.TopAbs import TopAbs_EDGE, TopAbs_FACE
from OCC.Core.BRepAdaptor import BRepAdaptor_Curve, BRepAdaptor_Surface
from OCC.Core.GeomAbs import GeomAbs_Cylinder, GeomAbs_Plane
from OCC.Core.TopoDS import topods
box=BRepPrimAPI_MakeBox(40,30,20).Shape()
def edges(sh):
    e=TopExp_Explorer(sh,TopAbs_EDGE); out=[]
    while e.More(): out.append(topods.Edge(e.Current())); e.Next()
    return out
def mid(ed):
    c=BRepAdaptor_Curve(ed); p=c.Value((c.FirstParameter()+c.LastParameter())/2); return (round(p.X(),3),round(p.Y(),3),round(p.Z(),3))
vert=[e for e in edges(box) if mid(e)==(0,0,10)][0]
f=BRepFilletAPI_MakeFillet(box); f.Add(3.0,vert); f.Build(); s1=f.Shape()
top=[e for e in edges(s1) if mid(e)==(20.0,30.0,20.0)][0]
c=BRepFilletAPI_MakeChamfer(s1); c.Add(2.0,top); c.Build(); s2=c.Shape()
e=TopExp_Explorer(s2,TopAbs_FACE); kinds=[]
while e.More():
    a=BRepAdaptor_Surface(topods.Face(e.Current())); t=a.GetType()
    kinds.append(('cyl',round(a.Cylinder().Radius(),3)) if t==GeomAbs_Cylinder else ('plane' if t==GeomAbs_Plane else t)); e.Next()
print(f.IsDone(), c.IsDone(), len(kinds), kinds)
