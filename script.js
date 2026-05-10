// Copyright 2026 MaPePeR
// SPDX-License-Identifier: AGPL-3.0-only

let memoryManager = new EmscriptenMemoryManager();

loadbutton.addEventListener("click", function () {
    console.log("Handling file change")
    const selectedFile = fileselect.files[0] || null;
    errorcontainer.innerText = "";
    if (!selectedFile) {
        errorcontainer.innerText += "No file selected.";
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        floorplancontainer.innerHTML = e.target.result;
        generateDistances();
    }
    reader.readAsText(selectedFile);
})
function generateDistances() {
    const areas = floorplancontainer.querySelectorAll('.ha-fp-hm-area');
    const sensors = floorplancontainer.querySelectorAll('.ha-fp-hm-sensor');
    if (!areas) {
        errorcontainer.innerText += "No areas with class 'ha-fp-hm-area' found.";
    }
    if (!sensors) {
        errorcontainer.innerText += "No sensors with class 'ha-fp-hm-sensor' found.";
    }
    if (!sensors || !areas) {
        return
    }
    const area_data = new Array(areas.length)
    try {
        for (let i = 0; i < areas.length; i++) {
            area_data[i] = new Area(areas[i], sensors)
        }
    } catch (e) {
        errorcontainer.innerText += ""+e
        throw e
    }
}


function getPolygon(area) {
    const pathdata = area.getPathData({"normalize": true})
    if (pathdata[0].type != "M") {
        throw new Error("First Area Path Command is not Move");
    }
    const vertices_geometry = [
        new Vector(
            pathdata[0].values[0],
            pathdata[0].values[1],
        )
    ]
    const vertices_earcut = [
        pathdata[0].values[0],
        pathdata[0].values[1],
    ];
    for (let i = 1; i < pathdata.length - 1; i++) {
        const segment = pathdata[i];
        if (segment.type == "L") {
            vertices_earcut.push(segment.values[0])
            vertices_earcut.push(segment.values[1])
            vertices_geometry.push(
                new Vector(
                    segment.values[0],
                    segment.values[1],
                )
            )
        } else {
            throw new Error(`Found unexpected path command ${segment.type} at index ${i}`)
        }
    }
    if (pathdata[pathdata.length - 1].type != "Z") {
        throw new Error(`Expected last path command to be Z`);
    }
    
    console.log("Starting earcut")
    const triangles = earcut.default(vertices_earcut)
    console.log("Done earcut")
    return {
        "v": vertices_geometry,
        "f": triangles,
    };
}

function createMesh(polygon) {
    const mesh = new Mesh()
    console.log("Building mesh")
    if (!mesh.build(polygon)) {
        throw new Error("Failed to build mesh")
    }
    console.log("Done building mesh")
    return mesh
}

class Area {
    constructor(area, sensors) {
        this.polygon = getPolygon(area);
        // TODO: Insert sensors as vertices
        this.mesh = createMesh(this.polygon);
        this.geometry = new Geometry(this.mesh, this.polygon["v"]);
        this.heatmethod = new HeatMethod(this.geometry);

        const V = this.mesh.vertices.length;
        this.delta = DenseMatrix.zeros(V, 1);
    }

    calculateForSensor(sensor) {
        this.delta.set(1, sensor, 0);
        const result = heatmethod.compute(delta)
        this.delta.set(0, sensor, 0);
        return result;
    }
}
