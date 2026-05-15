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
            const result = {
                sensors: {},
            };
            for (const sensor of sensors) {
                result.sensors[sensor.id] = area_data.getTextureData(sensor);
            }
            results[area.id] = result
        }
        console.log(results)
        resultcontainer.innerText = JSON.stringify(results, null, "  ");
        //createRenderer(results)
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
    const vertices = [
        new Vector(p.x, p.y),
    ]
    for (let i = 1; i < pathdata.length - 1; i++) {
        const segment = pathdata[i];
        p = convertCoords.transformPoint(new DOMPoint(segment.values[0], segment.values[1]))
        if (segment.type == "L") {
            vertices.push(new Vector(p.x, p.y))
        } else {
            throw new Error(`Found unexpected path command ${segment.type} at index ${i}`)
        }
    }
    if (pathdata[pathdata.length - 1].type != "Z") {
        throw new Error(`Expected last path command to be Z`);
    }
    
    // Shoelace formula to determine clockwise/counterclockwise
    let sum = 0;
    for (let i = 0; i < vertices.length; i++) {
        const p = vertices[i];
        const next = vertices[(i +1) % vertices.length];
        sum += (next.x - p.x) * (next.y + p.y);
    }
    if (sum > 0) {
        // polygon was clockwise. 
        vertices.reverse()
    }
    
    return vertices;
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

        console.log(this.convertCoords)

        this.polygon = getPolygon(area, this.convertCoords);
    }

    getTextureData(sensor) {
        const geometry = createDistanceGeometry(this.polygon, this.convertCoords.transformPoint(getCenterOfElement(sensor)));
        /*
        const mesh = geometry.mesh;
        const buffer = new ArrayBuffer(16/8 + mesh.vertices.length * 2 * 16/8 + mesh.faces.length * 3 * 16 / 8)
        const view = new DataView(buffer)
        let pos = 0;
        view.setUint16(pos, mesh.vertices.length)
        pos += 16/8;
        const v_buffer = new Float16Array(buffer, pos, mesh.vertices.length * 2)
        pos += mesh.vertices.length * 2 * 16 / 8;
        for(let i = 0; i < mesh.vertices.length; i += 1) {
            const v = this.geometry.positions[mesh.vertices[i].index];
            v_buffer[i * 2+0] = v.x;
            v_buffer[i * 2+1] = v.y;
        }

        const f_buffer = new Uint16Array(buffer, pos, mesh.faces.length * 3);
        console.log(f_buffer)
        for(let i = 0; i < mesh.faces.length; i++) {
            const face = mesh.faces[i];
            f_buffer[i*3 + 0] = face.halfedge.vertex.index;
            f_buffer[i*3 + 1] = face.halfedge.next.vertex.index;
            f_buffer[i*3 + 2] = face.halfedge.next.next.vertex.index;
        }

        return (new Uint8Array(buffer)).toBase64();
        */
       return "";
    }
}

function createDistanceGeometry(polygon, sourcePoint) {
    console.log("Startng distances for source:", sourcePoint)
    const mesh = new MyMesh();
    mesh.buildFromPolygon(polygon);
    const geometry = new MyGeometry(mesh, polygon, false);

    geometry.check(false, false)

    const sourceFace = mesh.addFace();
    sourceFace.source = sourcePoint;
    sourceFace.distanceSum = 0;

    const startEdge = geometry.getClosestEdgeToPoint(sourcePoint);
    startEdge.halfedge.distanceToSource = geometry.distToSegment(sourcePoint, startEdge);
    sourceFace.halfedge = startEdge.halfedge;
    startEdge.halfedge.face = sourceFace;

    startEdge.halfedge.next.distanceToSource = geometry.distToSegment(sourcePoint, startEdge.halfedge.next.edge);
    startEdge.halfedge.prev.distanceToSource = geometry.distToSegment(sourcePoint, startEdge.halfedge.prev.edge);

    console.log(geometry.printHalfedge(startEdge.halfedge));
    let nextEdges = [
        {halfedge: startEdge.halfedge.next, referencePrevious: true},
        {halfedge: startEdge.halfedge.prev, referencePrevious: false},
    ];
    while (nextEdges.length) {
        // TODO: Be smarter than this...
        nextEdges.sort((a,b) => a.halfedge.distanceToSource - b.halfedge.distanceToSource);
        const closest = nextEdges.shift();
        const halfedge = closest.halfedge;
        const referencePrevious = closest.referencePrevious;
        const vertexAlreadyVisited = referencePrevious ? halfedge.vertex : halfedge.next.vertex;
        const newVertex = referencePrevious  ? halfedge.next.vertex : halfedge.vertex;
        const pointAlreadyVisited = geometry.positionVector(vertexAlreadyVisited);
        const newPoint = geometry.positionVector(newVertex);
        const face = referencePrevious ? halfedge.prev.face : halfedge.next.face;
        const sourcePoint = face.source;
        const angle = geometry.smallestAngleBetweenVectors(pointAlreadyVisited.minus(sourcePoint), newPoint.minus(sourcePoint));

        console.log(geometry.printHalfedge(halfedge));

        if (Math.abs(angle) < 10e-4||(!referencePrevious && angle < 0) || (referencePrevious && angle > 0)) {
            // Source is visible for whole edge
            halfedge.face = face;
            const nextHalfedge = referencePrevious ? halfedge.next : halfedge.prev;
            if (!nextHalfedge.face) {
                nextHalfedge.distanceToSource = geometry.distToSegment(face.source, nextHalfedge.edge) + face.distanceSum;
                nextEdges.push({
                    halfedge: nextHalfedge,
                    referencePrevious: closest.referencePrevious,
                })
            }
        } else if ((!referencePrevious && angle > 0) || (referencePrevious && angle < 0)) {
            {
                const prev_vector = geometry.vector((referencePrevious ? halfedge.prev : halfedge).twin);
                const next_vector = geometry.vector(referencePrevious ? halfedge : halfedge.next);
                const rayAngle = geometry.angleBetweenVectors(pointAlreadyVisited.minus(sourcePoint), prev_vector);
                const cornerAngle = geometry.angleBetweenVectors(next_vector, prev_vector);
                if (rayAngle > cornerAngle) {
                    console.log("Intersection Ray leaves face. Ignoring")
                    continue;
                }
            }

            const intersection = geometry.closestIntersectionEdgeWithLine(pointAlreadyVisited, pointAlreadyVisited.minus(sourcePoint))
            console.log(intersection);

            if (!intersection) {
                throw new Error("Failed to intersect");
            }

            const splitPointDistanceToVertex = geometry.length(intersection.edge) * Math.min(intersection.ratio, 1-intersection.ratio)
            let newEdgeTo;
            if (splitPointDistanceToVertex < 2/1000) {
                console.log("Intersection very close");
                newEdgeTo = intersection.ratio < 0.5 ? intersection.edge.halfedge : intersection.edge.halfedge.next;
            } else {
                geometry.insertPointIntoEdge(intersection.point, intersection.edge)
                newEdgeTo = intersection.edge.halfedge.next;
            }
            const newEdgeFrom = referencePrevious ? halfedge.prev : halfedge;
            const newHalfedge = geometry.mesh.addEdgeConnectingHalfedges(newEdgeFrom, newEdgeTo)
            console.log(geometry.printAllHalfedges())
            //geometry.check(false, false)

            nextEdges = nextEdges.filter((c) => c.halfedge.edge !== intersection.edge)

            const newFace = geometry.mesh.addFace();
            newFace.source = pointAlreadyVisited;
            newFace.distanceSum = face.distanceSum + pointAlreadyVisited.minus(sourcePoint).norm();
            newFace.halfedge = newHalfedge;

            if (referencePrevious) {
                newHalfedge.twin.face = newFace;
                newHalfedge.twin.next.face = newFace;
            } else {
                newHalfedge.face = newFace;
                newHalfedge.prev.face = newFace;
            }

            const newHalfedgeOnThisFace = referencePrevious ? newHalfedge : newHalfedge.twin;
            const previousHalfedgeOnNewFace = referencePrevious ? newHalfedge.twin.prev : newHalfedge.prev.prev;
            const nextHalfedgeOnNewFace = referencePrevious ? newHalfedge.twin.next.next : newHalfedge.next

            newHalfedgeOnThisFace.distanceToSource = geometry.distToSegment(face.source, newHalfedgeOnThisFace.edge) + face.distanceSum;
            previousHalfedgeOnNewFace.distanceToSource = geometry.distToSegment(newFace.source, previousHalfedgeOnNewFace.edge) + newFace.distanceSum;
            nextHalfedgeOnNewFace.distanceToSource = geometry.distToSegment(newFace.source, nextHalfedgeOnNewFace.edge) + newFace.distanceSum;
            nextEdges.push({
                halfedge: newHalfedgeOnThisFace,
                referencePrevious: referencePrevious,
                debug: "retry"
            });
            nextEdges.push({
                halfedge: previousHalfedgeOnNewFace,
                referencePrevious: false,
                debug: "new_face_prev"
            });
            nextEdges.push({
                halfedge: nextHalfedgeOnNewFace,
                referencePrevious: true,
                debug: "new_face_next"
            });
        } else {
            throw new Error("unreachable");
        }

    }

    return geometry;
}