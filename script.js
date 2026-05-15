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
    if (!areas || !areas.length) {
        errorcontainer.innerText += "No areas with class 'ha-fp-hm-area' found.";
    }
    if (!sensors || !sensors.length) {
        errorcontainer.innerText += "No sensors with class 'ha-fp-hm-sensor' found.";
    }
    if (!sensors || !areas) {
        return
    }
    const canvases = floorplancontainer.querySelectorAll('foreignObject > canvas.ha-fp-hm');
    if (canvases.length != 1) {
        errorcontainer.innerText += "Cannot find exactly one 'foreignObject > canvas.ha-fp-hm' in floorplan";
        return
    }
    const canvas = canvases[0];
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
            const area_data = new Area(area, sensors, canvas)
            try {
            area_data.splitMeshForSensorDistances(sensors[0])
            } catch (e) {
                console.log(e);
            }
            const result = {
                tex: area_data.getTextureData(),
                sensor: area_data.getSensorData(),
                sensors: {},
            };
            results[area.id] = result
        }
        console.log(results)
        resultcontainer.innerText = JSON.stringify(results, null, "  ");
        createRenderer(results)
    /*} catch (e) {
        errorcontainer.innerText += ""+e*/
    } finally {
        memoryManager.deleteExcept([])
    }
}


function getPolygon(area, convertCoords) {
    const pathdata = area.getPathData({"normalize": true})
    console.log("Pathdata", pathdata.map((p) => `${p.type} ${p.values}`).join(" "))
    if (pathdata[0].type != "M") {
        throw new Error("First Area Path Command is not Move");
    }
    let p = convertCoords.transformPoint(new DOMPoint(pathdata[0].values[0], pathdata[0].values[1]))
    const vertices_geometry = [
        new Vector(p.x, p.y),
    ]
    const vertices_earcut = [
        p.x,
        p.y,
    ];
    for (let i = 1; i < pathdata.length - 1; i++) {
        const segment = pathdata[i];
        p = convertCoords.transformPoint(new DOMPoint(segment.values[0], segment.values[1]))
        if (segment.type == "L") {
            vertices_earcut.push(p.x)
            vertices_earcut.push(p.y)
            vertices_geometry.push(new Vector(p.x, p.y))
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
    const mesh = new MyMesh()
    console.log("Building mesh")
    if (!mesh.build(polygon)) {
        throw new Error("Failed to build mesh")
    }
    console.log("Done building mesh")
    return mesh
}

function getCenterOfElement(el) {
    const bbox = el.getBBox()
    const x = bbox.x + bbox.width / 2;
    const y = bbox.y + bbox.height / 2;
    return new Vector(x, y);
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
    constructor(area, sensors, canvas) {


        const area2screen = area.getScreenCTM();
        const screen2canvas = canvas.parentNode.getScreenCTM().inverse();
        const canvasBBox = canvas.parentNode.getBBox();
        
        // Applies in reverse order...
        this.convertCoords = new DOMMatrix()
            .flipY()
            .translate(-1, -1)
            .scale(2/canvasBBox.width, 2/canvasBBox.height)
            .translate(-canvasBBox.x, -canvasBBox.y)
            .multiply(screen2canvas)
            .multiply(area2screen);


        this.polygon = getPolygon(area, this.convertCoords);
        
        this.mesh = createMesh(this.polygon);
        this.geometry = new MyGeometry(this.mesh, this.polygon.v, false);
    }

    findFace(point) {
        for (const face of this.mesh.faces) {
            if (vertexInTriangle(
                point,
                this.geometry.positions[face.halfedge.vertex.index],
                this.geometry.positions[face.halfedge.next.vertex.index],
                this.geometry.positions[face.halfedge.prev.vertex.index],
            )) {
                return face;
            }
        }
        return null;
    }

    splitMeshForSensorDistances(sensor) {
        const point = this.convertCoords.transformPoint(getCenterOfElement(sensor));
        const sensorFace = this.findFace(point)
        if (!sensorFace) {
            throw new Error("Couldn't find sensor face");
        }

        const todos = [];
        let todo;
        let completeFaceTodos = [
            {
                halfedge: sensorFace.halfedge,
                point: point,
                distance: 0,
                minVector: this.geometry.positionVector(sensorFace.halfedge.vertex).minus(point),
                maxAngle: 2*Math.PI, // 2PI / 360 degrees
            }
        ];
        let partialTodos = [];
        let doneSplit = false;
        while (!doneSplit && (completeFaceTodos.length || todos.length)) {
            while (completeFaceTodos.length || todos.length) {
                while (todo = completeFaceTodos.shift()) {
                    console.log("Complete face", todo.halfedge.face);
                    console.log(this.geometry.printFace(todo.halfedge.face));
                    todo.halfedge.face.distancePoint = todo.point;
                    todo.halfedge.face.distanceSum = todo.distance;
                    for (const halfedge of todo.halfedge.face.adjacentHalfedges()) {
                        if (halfedge.twin.onBoundary) continue;
                        if (halfedge.twin.face.distancePoint) continue;
                        const minVector = this.geometry.positionVector(halfedge.vertex).minus(todo.point);
                        const maxVector = this.geometry.positionVector(halfedge.next.vertex).minus(todo.point);
                        const maxAngle = this.geometry.angleBetweenVectors(minVector, maxVector);
                        todos.push({
                            halfedge: halfedge.twin,
                            point: todo.point,
                            distance: todo.distance,
                            minVector: minVector,
                            maxAngle: maxAngle,
                        })
                    }
                }

                while(todo = todos.shift()) {
                    if (todo.halfedge.face.distancePoint) continue;
                    const v1 = this.geometry.positionVector(todo.halfedge.vertex).minus(todo.point);
                    const v2 = this.geometry.positionVector(todo.halfedge.next.vertex).minus(todo.point);
                    const v3 = this.geometry.positionVector(todo.halfedge.prev.vertex).minus(todo.point);
                    const angle_v1 = this.geometry.angleBetweenVectors(todo.minVector, v1);
                    const angle_v2 = this.geometry.angleBetweenVectors(todo.minVector, v2);
                    const angle_v3 = this.geometry.angleBetweenVectors(todo.minVector, v3);
                    if (angle_v1 <= todo.maxAngle
                        && angle_v2 <= todo.maxAngle
                        && angle_v3 <= todo.maxAngle
                    ) {
                        completeFaceTodos.push(todo);
                    } else {
                        partialTodos.push(todo);
                    }
                }
                /*
                let unsolvedPartials = [];
                
                while(todo = partialTodos.shift()) {
                    for (const halfedge of todo.halfedge.face.adjacentHalfedges()) {
                        if (halfedge.twin.face.distancePoint === todo.point
                            && halfedge.prev.twin.face.distancePoint === todo.point) {
                                const v = this.geometry.positions[halfedge.vertex.index];
                                if (todo.minVector.dot(v.minus(todo.point).unit()) < todo.maxAngle) {
                                    // Point is in viewcone and both adjacent faces are viewable.
                                    completeFaceTodos.push(todo)
                                    continue;
                                }
                            }
                    }
                    unsolvedPartials.push(todo);
                }
                partialTodos = unsolvedPartials;
                */
            }
            console.log("Unsolved:", partialTodos);
            while (partialTodos.length) {
                doneSplit = false;
                todo = partialTodos.shift();
                if (!this.geometry.positionVector(todo.halfedge.vertex).isValid()) {
                    throw new Error("Invalid vector");
                }
                const freeVertex = this.geometry.positionVector(todo.halfedge.prev.vertex);
                let halfedge_to_split;
                let other_halfedge;
                let fixedVertex;
                const angle = this.geometry.smallestAngleBetweenVectors(todo.minVector, freeVertex.minus(todo.point));
                if (angle < 2 * Math.PI/720) {
                    console.log("Skip split with very small angle")
                    completeFaceTodos.push(todo)
                    continue;
                }

                if (angle < 0) {
                    halfedge_to_split = todo.halfedge.prev;
                    other_halfedge = todo.halfedge.next;
                    fixedVertex = this.geometry.positionVector(todo.halfedge.next.vertex);
                } else {
                    halfedge_to_split = todo.halfedge.next;
                    other_halfedge = todo.halfedge.prev;
                    fixedVertex = this.geometry.positionVector(todo.halfedge.vertex);
                }
                const p1 = todo.point;
                const p2 = fixedVertex;
                const p3 = this.geometry.positionVector(halfedge_to_split.vertex);
                const p4 = this.geometry.positionVector(halfedge_to_split.next.vertex);
                let ratio = -((p1.x - p2.x)*(p1.y - p3.y) - (p1.y - p2.y)*(p1.x - p3.x)) / ((p1.x - p2.x)*(p3.y - p4.y) - (p1.y - p2.y)*(p3.x - p4.x))
                if (ratio <= 0 || ratio >= 1) {
                    console.log("Skipping halfedge split")
                    continue;
                    //throw new Error(`Ratio was not between 0 and 1: ${ratio}`)
                }
                this.geometry.splitHalfEdgeAtRatio(halfedge_to_split, ratio);
                completeFaceTodos.push(todo)
                if (angle < 0) {
                    const minVector = this.geometry.vector(other_halfedge);
                    const maxVector = this.geometry.vector(other_halfedge.prev.twin);
                    const maxAngle = this.geometry.angleBetweenVectors(minVector, maxVector);
                    completeFaceTodos.push({
                        halfedge: other_halfedge.prev,
                        point: fixedVertex,
                        distance: fixedVertex.minus(todo.point).norm2() + todo.distance,
                        minVector: minVector,
                        maxAngle: maxAngle,
                    })
                } else {
                    const minVector = this.geometry.vector(other_halfedge.next);
                    const maxVector = this.geometry.vector(other_halfedge.twin);
                    const maxAngle = this.geometry.angleBetweenVectors(minVector, maxVector);
                    completeFaceTodos.push({
                        halfedge: other_halfedge.next,
                        point: fixedVertex,
                        distance: fixedVertex.minus(todo.point).norm2() + todo.distance,
                        minVector: minVector,
                        maxAngle: maxAngle,
                    })
                }
                console.log(`{${this.geometry.printFace(completeFaceTodos[completeFaceTodos.length - 2].halfedge.face)},${this.geometry.printFace(completeFaceTodos[completeFaceTodos.length - 1].halfedge.face)}}`)
                break;
            }

        }
    }

    getTextureData() {
        const buffer = new ArrayBuffer(16/8 + this.mesh.vertices.length * 2 * 16/8 + this.mesh.faces.length * 3 * 16 / 8)
        const view = new DataView(buffer)
        let pos = 0;
        view.setUint16(pos, this.mesh.vertices.length)
        pos += 16/8;
        const v_buffer = new Float16Array(buffer, pos, this.mesh.vertices.length * 2)
        pos += this.mesh.vertices.length * 2 * 16 / 8;
        for(let i = 0; i < this.mesh.vertices.length; i += 1) {
            const v = this.geometry.positions[this.mesh.vertices[i].index];
            v_buffer[i * 2+0] = v.x;
            v_buffer[i * 2+1] = v.y;
        }

        const f_buffer = new Uint16Array(buffer, pos, this.mesh.faces.length * 3);
        console.log(f_buffer)
        for(let i = 0; i < this.mesh.faces.length; i++) {
            const face = this.mesh.faces[i];
            f_buffer[i*3 + 0] = face.halfedge.vertex.index;
            f_buffer[i*3 + 1] = face.halfedge.next.vertex.index;
            f_buffer[i*3 + 2] = face.halfedge.next.next.vertex.index;
        }

        return (new Uint8Array(buffer)).toBase64();
    }

    getSensorData() {
        const data = new Float32Array(this.mesh.faces.length * 3);
        for (let i = 0; i < this.mesh.faces.length; i++) {
            const face = this.mesh.faces[i];
            if (face.distancePoint) {
                data[i * 3 + 0] = face.distancePoint.x;
                data[i * 3 + 1] = face.distancePoint.y;
                data[i * 3 + 2] = face.distanceSum;
            } else {
                data[i * 3 + 0] = 0;
                data[i * 3 + 1] = 0;
                data[i * 3 + 2] = -1;
            }
        }
        console.log("sensordata", data);
        return (new Uint8Array(data.buffer)).toBase64();
    }
}
