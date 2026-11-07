# Build as_recognize: a headless runner for Analysis Situs's hole and cavity recognizers
# (as_recognize.cpp in this folder), used by tests/grading/schild.py.
#
# Outside code: Analysis Situs (gitlab.com/ssv/AnalysisSitus) and the headers of Mobius
# (gitlab.com/ssv/Mobius), both BSD-3-Clause (Sergey Slyadnev); OpenCascade 7.7.2 (LGPL-2.1 with
# exception) from conda-forge. Nothing from them is copied into this repo: AS_DIR points at a
# git-ignored checkout. OCCT 7.8+ fails on Analysis Situs's old hasher API, so pin 7.7.2.
#
# Normally run by tests/grading/others/setup.sh. By hand:
#   cmake -S tests/grading/others -B <build> -DCMAKE_PREFIX_PATH=<occt 7.7.2 env> \
#         -DAS_DIR=<AnalysisSitus checkout> -DMOBIUS_INC=<folder holding mobius/*.h>
#   cmake --build <build> -j4
#
# Only the 56 sources the two recognizers reach are compiled (found from a linker map of the whole
# asiAlgo + asiActiveData build). Their Mobius calls sit in functions the recognizers never use;
# --gc-sections drops those, so Mobius needs headers only, no library.

cmake_minimum_required(VERSION 3.16)
project(as_recognize CXX)

set(CMAKE_CXX_STANDARD 17)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

set(AS_DIR "" CACHE PATH "Analysis Situs checkout")
set(MOBIUS_INC "" CACHE PATH "folder that holds mobius/core.h and the other Mobius headers")
if(NOT EXISTS "${AS_DIR}/src/asiAlgo/features/asiAlgo_RecognizeDrillHoles.cpp")
  message(FATAL_ERROR "AS_DIR is not an Analysis Situs checkout: '${AS_DIR}'")
endif()
if(NOT EXISTS "${MOBIUS_INC}/mobius/core.h")
  message(FATAL_ERROR "MOBIUS_INC has no mobius/core.h: '${MOBIUS_INC}'")
endif()

find_package(OpenCASCADE 7.7.2 EXACT REQUIRED CONFIG)
find_package(Eigen3 REQUIRED CONFIG)

set(AS_SOURCES
  src/asiActiveData/API/ActAPI_IAlgorithm.cpp
  src/asiActiveData/API/ActAPI_IPlotter.cpp
  src/asiActiveData/Mesh/DS/ActData_Mesh.cpp
  src/asiActiveData/Mesh/DS/ActData_Mesh_Direction.cpp
  src/asiActiveData/Mesh/DS/ActData_Mesh_Edge.cpp
  src/asiActiveData/Mesh/DS/ActData_Mesh_Element.cpp
  src/asiActiveData/Mesh/DS/ActData_Mesh_ElementsIterator.cpp
  src/asiActiveData/Mesh/DS/ActData_Mesh_Face.cpp
  src/asiActiveData/Mesh/DS/ActData_Mesh_IDFactory.cpp
  src/asiActiveData/Mesh/DS/ActData_Mesh_MapOfMeshOrientedElement.cpp
  src/asiActiveData/Mesh/DS/ActData_Mesh_Node.cpp
  src/asiActiveData/Mesh/DS/ActData_Mesh_Position.cpp
  src/asiActiveData/Mesh/DS/ActData_Mesh_Quadrangle.cpp
  src/asiActiveData/Mesh/DS/ActData_Mesh_Triangle.cpp
  src/asiAlgo/features/asiAlgo_AAG.cpp
  src/asiAlgo/features/asiAlgo_AAGIterator.cpp
  src/asiAlgo/features/asiAlgo_AdjacencyMx.cpp
  src/asiAlgo/editing/asiAlgo_BRepNormalization.cpp
  src/asiAlgo/editing/asiAlgo_BRepNormalizer.cpp
  src/asiAlgo/points/asiAlgo_BaseCloud.cpp
  src/asiAlgo/appsurf/asiAlgo_BuildCoonsSurf.cpp
  src/asiAlgo/features/asiAlgo_CheckDihedralAngle.cpp
  src/asiAlgo/auxiliary/asiAlgo_CheckValidity.cpp
  src/asiAlgo/auxiliary/asiAlgo_ClassifyPointFace.cpp
  src/asiAlgo/canrec/asiAlgo_ConvertCanonical.cpp
  src/asiAlgo/canrec/asiAlgo_ConvertCanonicalCurve.cpp
  src/asiAlgo/canrec/asiAlgo_ConvertCanonicalMod.cpp
  src/asiAlgo/canrec/asiAlgo_ConvertCanonicalSurface.cpp
  src/asiAlgo/discr/asiAlgo_DiscrBuilder.cpp
  src/asiAlgo/discr/asiAlgo_DiscrClassifier2d.cpp
  src/asiAlgo/discr/asiAlgo_DiscrCurve.cpp
  src/asiAlgo/discr/asiAlgo_DiscrCurve2d.cpp
  src/asiAlgo/discr/asiAlgo_DiscrCurveAdaptor.cpp
  src/asiAlgo/discr/asiAlgo_DiscrEdge.cpp
  src/asiAlgo/discr/asiAlgo_DiscrFace.cpp
  src/asiAlgo/discr/asiAlgo_DiscrModel.cpp
  src/asiAlgo/discr/asiAlgo_DiscrParams.cpp
  src/asiAlgo/discr/asiAlgo_DiscrTessellateCurve.cpp
  src/asiAlgo/discr/asiAlgo_DiscrWire.cpp
  src/asiAlgo/features/asiAlgo_FindFeatureHints.cpp
  src/asiAlgo/editing/asiAlgo_History.cpp
  src/asiAlgo/interop/asiAlgo_IGES.cpp
  src/asiAlgo/auxiliary/asiAlgo_IntersectSS.cpp
  src/asiAlgo/mesh/asiAlgo_MeshCheckTopology.cpp
  src/asiAlgo/mesh/asiAlgo_MeshInfo.cpp
  src/asiAlgo/interop/asiAlgo_PLY.cpp
  src/asiAlgo/points/asiAlgo_PointCloudUtils.cpp
  src/asiAlgo/canrec/asiAlgo_RecognizeCanonical.cpp
  src/asiAlgo/features/asiAlgo_RecognizeCavities.cpp
  src/asiAlgo/features/asiAlgo_RecognizeCavitiesRule.cpp
  src/asiAlgo/features/asiAlgo_RecognizeDrillHoles.cpp
  src/asiAlgo/features/asiAlgo_RecognizeDrillHolesRule.cpp
  src/asiAlgo/features/asiAlgo_Recognizer.cpp
  src/asiAlgo/points/asiAlgo_RelievePointCloud.cpp
  src/asiAlgo/auxiliary/asiAlgo_UnifySameDomain.cpp
  src/asiAlgo/auxiliary/asiAlgo_Utils.cpp
)
list(TRANSFORM AS_SOURCES PREPEND "${AS_DIR}/")

# Every folder under asiAlgo and asiActiveData, as Analysis Situs's own build includes them.
file(GLOB_RECURSE _as_headers LIST_DIRECTORIES false "${AS_DIR}/src/asiAlgo/*.h" "${AS_DIR}/src/asiActiveData/*.h")
set(AS_INCLUDES "")
foreach(_h ${_as_headers})
  get_filename_component(_d "${_h}" DIRECTORY)
  list(APPEND AS_INCLUDES "${_d}")
endforeach()
list(REMOVE_DUPLICATES AS_INCLUDES)

add_executable(as_recognize as_recognize.cpp ${AS_SOURCES})
target_include_directories(as_recognize SYSTEM PRIVATE ${AS_INCLUDES} "${MOBIUS_INC}" ${OpenCASCADE_INCLUDE_DIR})
target_compile_options(as_recognize PRIVATE -w -ffunction-sections -fdata-sections)
target_link_options(as_recognize PRIVATE -Wl,--gc-sections)
# The toolkits the linked code needs (readelf NEEDED with --as-needed). Not ${OpenCASCADE_LIBRARIES}:
# its TKOpenGl target asks for -lGL, and conda-forge's runtime libGL has no libGL.so dev link.
set(OCCT_TOOLKITS TKernel TKMath TKG2d TKG3d TKGeomBase TKGeomAlgo TKBRep TKTopAlgo TKBO TKOffset
  TKShHealing TKXSBase TKSTEP TKIGES TKSTL TKService TKV3d TKOpenGl)
list(TRANSFORM OCCT_TOOLKITS PREPEND "${OpenCASCADE_LIBRARY_DIR}/lib")
list(TRANSFORM OCCT_TOOLKITS APPEND ".so")
target_link_libraries(as_recognize PRIVATE ${OCCT_TOOLKITS} Eigen3::Eigen)
set_target_properties(as_recognize PROPERTIES BUILD_RPATH "${OpenCASCADE_LIBRARY_DIR}")
