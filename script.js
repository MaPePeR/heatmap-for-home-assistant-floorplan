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
    let missingId = false;
    for (const area of areas) {
        if (!area.id) {
            errorcontainer.innerText += "Area is missing id attribute.";
            missingId = true;
        }
    }
    for (const sensor of sensors) {
        if (!sensor.id) {
            errorcontainer.innerText += "Sensor is missing id attribute";
            missingId = true;
        }
    }
    if (missingId) {
        return;
    }
    const results = {};
    try {
        for (const area of areas) {
            const area_data = new Area(area, sensors)
            const result = {
                tex: area_data.getTextureData(),
                sensors: {},
            };
            for (const sensor of sensors) {
                console.log("Calculating for ", sensor)
                result.sensors[sensor.id] = area_data.calculateForSensor(sensor)
            }
            results[area.id] = result
        }
        console.log(results)
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

function getCenterOfElement(el) {
    const bbox = el.getBBox()
    return new Vector(
        bbox.x + bbox.width / 2,
        bbox.y + bbox.height / 2,
    )
}

function vertexInTriangle(pt, v1, v2, v3) {
    // https://stackoverflow.com/a/2049593/2256700
    const d1 = (pt.x - v2.x) * (v1.y - v2.y) - (v1.x - v2.x) * (pt.y - v2.y);
    const d2 = (pt.x - v3.x) * (v2.y - v3.y) - (v2.x - v3.x) * (pt.y - v3.y);
    const d3 = (pt.x - v1.x) * (v3.y - v1.y) - (v3.x - v1.x) * (pt.y - v1.y);

    const has_neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const has_pos = (d1 > 0) || (d2 > 0) || (d3 > 0);

    return !(has_neg && has_pos);
}

function insertVertexIntoPolygon(polygon, v) {
    const vertices = polygon.v;
    vertices.push(v);
    const vertex_id = vertices.length - 1;
    const triangles = polygon.f;
    const new_triangles = new Array();
    let found = false;
    for(let i = 0; i + 3 <= triangles.length; i += 3) {
        const i1=triangles[i], i2=triangles[i+1], i3=triangles[i+2];
        if (vertexInTriangle(v, vertices[i1], vertices[i2], vertices[i3])) {
            if (found) {
                throw new Error("Found vertex in multiple triangles. Duplicate sensor?");
            }
            found = true;
            new_triangles.push(
                i1, i2, vertex_id,
                i1, vertex_id, i3,
                vertex_id, i2, i3,
            )
        } else {
            new_triangles.push(i1, i2, i3);
        }
    }
    if (!found) {
        throw new Error("Did not find triangle for vertex");
    }
    polygon.f = new_triangles;
    return vertex_id
}

class Area {
    constructor(area, sensors) {
        this.polygon = getPolygon(area);
        this.sensorsToVertexId = new Map();

        for (const sensor of sensors) {
            const sensorVertexId = insertVertexIntoPolygon(this.polygon, getCenterOfElement(sensor))
            this.sensorsToVertexId.set(sensor, sensorVertexId)
        }
        this.mesh = createMesh(this.polygon);
        this.geometry = new Geometry(this.mesh, this.polygon["v"]);
        this.heatMethod = new HeatMethod(this.geometry);

        const V = this.mesh.vertices.length;
        this.delta = DenseMatrix.zeros(V, 1);
    }

    getTextureData() {
        const buffer = new ArrayBuffer(16/8 + this.polygon.v.length * 2 * 16/8 + this.polygon.f.length * 16 / 8)
        const view = new DataView(buffer)
        let pos = 0;
        view.setUint16(pos, this.polygon.v.length / 2)
        pos += 16/8;
        const v_buffer = new Float16Array(buffer, pos, this.polygon.v.length)
        pos += this.polygon.v.length * 2 * 16 / 8;
        const f_buffer = new Uint16Array(buffer, pos, this.polygon.f.length);
        for(let i = 0; i < this.polygon.v.length; i += 1) {
            const v = this.polygon.v[i];
            v_buffer[i * 2+0] = v.x;
            v_buffer[i * 2+1] = v.y;
        }
        for(let i = 0; i < this.polygon.f.length; i++) {
            f_buffer[i] = this.polygon.f[i];
        }
        // https://stackoverflow.com/a/11562550
        return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)));
    }

    calculateForSensor(sensor) {
        const sensorId = this.sensorsToVertexId.get(sensor);
        this.delta.set(1, sensorId, 0);
        const result = this.heatMethod.compute(this.delta)
        this.delta.set(0, sensorId, 0);

        if (result.nRows() != this.polygon.v.length) {
            throw new Error(`HeatMethod result has wrong dimension. Expected ${this.polygon.v.length}x1. Got ${result.nRows()}x${result.nCols()}`)
        }

        const data = new Float32Array(this.polygon.v.length);
        for (let i = 0; i < this.polygon.v.length; i++) {
            data[i] = result.get(i, 0);
        }

        memoryManager.deleteExcept([this.delta, this.heatMethod.A, this.heatMethod.F]);

        // https://stackoverflow.com/a/11562550
        return btoa(String.fromCharCode.apply(null, new Uint8Array(data.buffer)));
    }
}
