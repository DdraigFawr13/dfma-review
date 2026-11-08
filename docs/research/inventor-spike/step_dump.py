import sys, json
from OCC.Core.TopExp import TopExp_Explorer
from OCC.Core.TopAbs import TopAbs_VERTEX
from OCC.Core.BRep import BRep_Tool
from OCC.Core.TopoDS import topods
from dfma.read import read_step
part=read_step(sys.argv[1]); e=TopExp_Explorer(part.solid,TopAbs_VERTEX); pts=set()
while e.More():
    p=BRep_Tool.Pnt(topods.Vertex(e.Current())); pts.add((round(p.X(),4),round(p.Y(),4),round(p.Z(),4))); e.Next()
json.dump(sorted(pts),sys.stdout)
