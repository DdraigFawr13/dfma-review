// as_recognize: a small headless runner for Analysis Situs's hole and cavity recognizers.
//
// What: loads one STEP or BREP file, builds Analysis Situs's attributed adjacency graph (AAG) over
// the whole shape and runs asiAlgo_RecognizeDrillHoles (the `recognize-holes` command) or
// asiAlgo_RecognizeCavities (the `recognize-cavities` command). It prints the recognized face ids,
// 1-based in TopExp::MapShapes(shape, TopAbs_FACE) order, as one line "FIDS: <id> <id> ...".
// tests/grading/schild.py calls it and parses that line.
//
// Usage:  as_recognize <file.step|file.brep> <holes|cavities> <limit> [<max volume>]
//   limit: holes = max radius, cavities = max feature size; 0 means unlimited (as in the Tcl
//   commands, which treat a zero limit as no limit). max volume: cavities only, default 0 (none).
//   schild.py always passes limit 0; the limits exist so a case can be run with its own settings.
//
// Licence: this file is ours. It links Analysis Situs sources (gitlab.com/ssv/AnalysisSitus,
// BSD-3-Clause) and OpenCascade 7.7.2 (LGPL-2.1 with exception). Nothing from Analysis Situs is
// copied here; the calls follow ENGINE_RecognizeHoles / ENGINE_RecognizeCavities in its
// src/cmdEngine/cmdEngine_Inspection.cpp.
//
// Build: tests/grading/others/setup.sh (CMakeLists.txt in this folder).

#include <asiAlgo_AAG.h>
#include <asiAlgo_RecognizeCavities.h>
#include <asiAlgo_RecognizeDrillHoles.h>

#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <Precision.hxx>
#include <STEPControl_Reader.hxx>
#include <TColStd_MapIteratorOfPackedMapOfInteger.hxx>
#include <TopoDS_Shape.hxx>
#include <gp.hxx>

#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>

static bool endsWith(std::string s, const std::string& suffix)
{
  std::transform(s.begin(), s.end(), s.begin(), ::tolower);
  return s.size() >= suffix.size() && s.compare(s.size() - suffix.size(), suffix.size(), suffix) == 0;
}

// The same whole-file shape schild.py maps faces over: BRepTools::Read for BREP,
// STEPControl_Reader::OneShape for STEP.
static bool readShape(const std::string& path, TopoDS_Shape& shape)
{
  if ( endsWith(path, ".brep") )
  {
    BRep_Builder bb;
    return BRepTools::Read(shape, path.c_str(), bb) && !shape.IsNull();
  }
  STEPControl_Reader reader;
  if ( reader.ReadFile(path.c_str()) != IFSelect_RetDone )
    return false;
  reader.TransferRoots();
  shape = reader.OneShape();
  return !shape.IsNull();
}

int main(int argc, char** argv)
{
  if ( argc != 4 && argc != 5 )
  {
    std::cerr << "usage: as_recognize <file.step|file.brep> <holes|cavities> <limit> [<max volume>] (0 = none)\n";
    return 2;
  }
  const std::string path = argv[1];
  const std::string mode = argv[2];
  double limit = std::atof(argv[3]);
  if ( Abs(limit) < gp::Resolution() )
    limit = Precision::Infinite();
  double maxVolume = argc == 5 ? std::atof(argv[4]) : 0.0;
  if ( Abs(maxVolume) < gp::Resolution() )
    maxVolume = Precision::Infinite();

  TopoDS_Shape shape;
  if ( !readShape(path, shape) )
  {
    std::cerr << "cannot read " << path << "\n";
    return 3;
  }

  Handle(asiAlgo_AAG) G = new asiAlgo_AAG(shape);
  asiAlgo_Feature fids;

  if ( mode == "holes" )
  {
    asiAlgo_RecognizeDrillHoles rec(G, true); // doHard = true, as recognize-holes
    if ( !rec.Perform(limit) )
    {
      std::cerr << "hole recognition failed\n";
      return 4;
    }
    fids = rec.GetResultIndices();
  }
  else if ( mode == "cavities" )
  {
    asiAlgo_RecognizeCavities rec(G);
    rec.SetMaxSize(limit);
    rec.SetMaxVolume(maxVolume);
    if ( !rec.Perform() )
    {
      std::cerr << "cavity recognition failed\n";
      return 4;
    }
    fids = rec.GetResultIndices();
  }
  else
  {
    std::cerr << "mode must be holes or cavities\n";
    return 2;
  }

  std::vector<int> ids;
  for ( TColStd_MapIteratorOfPackedMapOfInteger it(fids); it.More(); it.Next() )
    ids.push_back(it.Key());
  std::sort(ids.begin(), ids.end());

  std::cout << "FIDS:";
  for ( int id : ids )
    std::cout << " " << id;
  std::cout << std::endl;
  return 0;
}
