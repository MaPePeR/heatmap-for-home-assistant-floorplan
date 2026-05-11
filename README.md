# home-assistant-floorplan-heatmap
Attempt to create heatmaps to use in home assistant floorplan


Project abandoned for now, because the distance Algorithm from https://github.com/GeometryCollective/geometry-processing-js is not very exact or I am using it wrong.
It reports 0 distance to vertices that aren't the source, which is weird and also produces artifacts.
Maybe those could be fixed by adding more nodes to the mesh? Maybe switch to https://github.com/mojocorp/geodesic/ for distance calculation? But requires compiling it to webasm or porting.