// Port of service/dfma/mesh.py: triangulate each face (spec Flow step 6). Flat xyz per face, mm, file coordinates,
// rounded to 5 decimals; indices are local to the face; normals are computed in the browser.
import type { OC } from "./oc";
import { MESH_ANGULAR_RAD, MESH_LINEAR_MM } from "./settings";
import { round } from "./units";

export interface FaceMesh { positions: number[]; indices: number[] }

/** [{positions, indices}] in face-id order. */
export function meshFaces(oc: OC, solid: unknown, faces: unknown[]): FaceMesh[] {
  const mesher = new oc.BRepMesh_IncrementalMesh(solid, MESH_LINEAR_MM, false, MESH_ANGULAR_RAD, true);
  mesher.delete();
  return faces.map((face) => {
    const location = new oc.TopLoc_Location();
    const tri = oc.BRep_Tool.Triangulation(face, location, 0); // Poly_MeshPurpose_NONE, as pythonocc's default
    const positions: number[] = [];
    const indices: number[] = [];
    if (tri && !(tri.IsNull?.() ?? false)) {
      const transform = location.Transformation();
      for (let i = 1; i <= tri.NbNodes(); i++) {
        const p = tri.Node(i).Transformed(transform);
        positions.push(round(p.X(), 5), round(p.Y(), 5), round(p.Z(), 5));
        p.delete();
      }
      const reversed = String((face as OC).Orientation()) === "TopAbs_REVERSED";
      for (let i = 1; i <= tri.NbTriangles(); i++) {
        const t = tri.Triangle(i).Get();
        let [a, b, c] = [t.theN1, t.theN2, t.theN3];
        if (reversed) [b, c] = [c, b]; // keep triangles facing out of the material
        indices.push(a - 1, b - 1, c - 1);
      }
    }
    location.delete();
    return { positions, indices };
  });
}
