// Copyright 2026 MaPePeR
// SPDX-License-Identifier: AGPL-3.0-only

class MyGeometry extends Geometry {
    splitHalfEdgeAtRatio(halfedge, ratio) {
        if (ratio <= 0 || ratio >= 1) {
            throw new Error("Ratio has to be between 0 and 1");
        }

        const pos1 = this.positionVector(halfedge.vertex);
        const pos2 = this.positionVector(halfedge.next.vertex);
        const new_pos = pos1.plus(pos2.minus(pos1).times(ratio))
        this.mesh.splitHalfEdge(halfedge);
        this.positions[halfedge.next.vertex.index] = new_pos;

        this.check();
    }

    positionVector(vertex) {
        return this.positions[vertex];
    }

    angleBetweenVectors(v1, v2) {
        v1 = v1.unit();
        v2 = v2.unit();
        // https://stackoverflow.com/a/16544330
        const dot = v1.x*v2.x + v1.y*v2.y;
        const det = v1.x*v2.y - v1.y*v2.x;
        const angle = Math.atan2(-det, -dot) + Math.PI;
        if (!isFinite(angle)) {
            throw new Error("Error calculating angle");
        }
        return angle
    }

    smallestAngleBetweenVectors(v1, v2) {
        v1 = v1.unit();
        v2 = v2.unit();
        // https://stackoverflow.com/a/16544330
        const dot = v1.x*v2.x + v1.y*v2.y;
        const det = v1.x*v2.y - v1.y*v2.x;
        const angle = Math.atan2(det, dot)
        if (!isFinite(angle)) {
            throw new Error("Error calculating angle");
        }
        return angle
    }

    printFace(f) {
        const points = [];
        const edges = [];
        for (const halfedge of f.adjacentHalfedges()) {
            const p = this.positionVector(halfedge.vertex);
            points.push(`(${p.x}, ${p.y})`)
            const p2 = this.positionVector(halfedge.next.vertex)
            edges.push(`Vector((${p.x}, ${p.y}), (${p2.x}, ${p2.y}))`)
        }
        return `{Polygon(${points.join(", ")}),${edges.join(",")}}`
    }

    printHalfedge(halfedge) {
        const p1 = this.positionVector(halfedge.vertex);
        const p2 = this.positionVector(halfedge.next.vertex);
        return `Vector((${p1.x}, ${p1.y}), (${p2.x}, ${p2.y}))`
    }

    printAllHalfedges(boundary=false) {
        let r = [];
        for (const halfedge of this.mesh.halfedges) {
            if (!halfedge.onBoundary || (boundary)) {
                r.push(this.printHalfedge(halfedge))
            }
        }
        return `{${r.join(",")}}`;
    }

    check(triangular=true, face=true) {
        this.mesh.check(triangular, face);
        let cwCount = 0;
        let ccwCount = 0;
        for (const face of this.mesh.faces) {
            let halfedge = face.halfedge;
            let sum = 0;
            do {
                const p = this.positionVector(halfedge.vertex);
                const next = this.positionVector(halfedge.next.vertex);
                sum += (next.x - p.x) * (next.y + p.y);
                halfedge = halfedge.next;
            } while (halfedge != face.halfedge);
            if (sum > 0) {
                cwCount += 1;
                console.log("face is clockwise and not counterclockwise", face)
            } else {
                ccwCount +=1;
            }
        }
        console.log("CCW:", ccwCount, "CW:", cwCount)
    }

    fixRotations() {
        for (const halfedge of this.mesh.halfedges) {
            if (halfedge.onBoundary) continue;
            const c = this.centroid(halfedge.face);
            const angle = this.smallestAngleBetweenVectors(this.positionVector(halfedge.vertex).minus(c), this.positionVector(halfedge.next.vertex).minus(c))
            if (angle < 0) {
                const p1 = halfedge;
                const p2 = halfedge.next
                const p3 = halfedge.next.next;
                p1.next = p3;
                p2.next = p1;
                p3.next = p2;
                p1.prev = p2;
                p2.prev = p3;
                p3.prev = p1;
            }
        }
    }

    distToSegment(p, edge, clamp=true) {
        const a = this.positionVector(edge.halfedge.vertex);
        const b = this.positionVector(edge.halfedge.next.vertex);
        var l2 = Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2);
        if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y); // a == b
        
        // Project point p onto the line, clamping between 0 and 1
        var t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
        if (clamp) {
            t = Math.max(0, Math.min(1, t));
        }
        
        // Find closest point on segment
        var closest = new Vector(
          a.x + t * (b.x - a.x),
          a.y + t * (b.y - a.y)
        );
        
        return Math.hypot(p.x - closest.x, p.y - closest.y);
      }

    getClosestEdgeToPoint(point) {
        let minDistance = Infinity;
        let minEdge = null;
        for (const edge of this.mesh.edges) {
            const d = this.distToSegment(point, edge)
            if (d < minDistance) {
                minDistance = d;
                minEdge = edge;
            }
        }
        return minEdge;
    }

    intersectRayEdge(point, direction, edge) {
        const eps = 10e-10;
        const A = this.positionVector(edge.halfedge.vertex);
        const B = this.positionVector(edge.halfedge.twin.vertex);

        const lineA = point;
        
        const denom = (B.x - A.x) * (direction.y) - (B.y - A.y) * (direction.x);
        if (Math.abs(denom) < eps) {
            // Parallel lines?
            if (this.distToSegment(lineA, edge, false) < eps) {
                // Edge and ray are on the same line
                let d_a;
                let d_b;
                if (Math.abs(direction.x) > Math.abs(direction.y)) {
                    d_a = (A.x - point.x) / direction.x;
                    d_b = (B.x - point.x) / direction.x;
                } else {
                    d_a = (A.y - point.y) / direction.y;
                    d_b = (B.y - point.y) / direction.y;
                }
                if (d_a < 0 && d_b < 0) {
                    return null;
                }
                if (d_a < d_b) {
                    return [d_a, 0];
                } else {
                    return [d_b, 1];
                }
            } else {
                return null;
            }
        }
        
        const ratio = ((lineA.x - A.x) * (direction.y) - (lineA.y - A.y) * (direction.x)) / denom;
        const d = ((lineA.x - A.x) * (B.y - A.y) - (lineA.y - A.y) * (B.x - A.x)) / denom;
        
        return [d, ratio];
        
    }

    closestIntersectionEdgeWithLine(point, direction) {
        let minDistance = Infinity;
        let minEdge = null;
        let minRatio = null;

        direction = direction.unit();
        
        for (const edge of this.mesh.edges) {
            const intersection = this.intersectRayEdge(point, direction, edge);

            if (!intersection) {
                continue;
            }

            const [d,ratio] = intersection;
            if (0 <= ratio && ratio < 1 && d > 0) {
                if (d < minDistance) {
                    minDistance = d;
                    minEdge = edge;
                    minRatio = ratio;
                }
            }
        }
        if (minEdge) {
            if (!minEdge.halfedge.twin.onBoundary) {
                throw new Error("Found closest edge, but its twin is not a boundary");
            }
            return {edge: minEdge, distance: minDistance, ratio: minRatio, point: point.plus(direction.times(minDistance))};
        } else {
            return null;
        }
    }

    checkLineOfSight(point, edge) {
        const eps = 10e-4;
        if (this.distToSegment(point, edge, false) < eps) {
            // Line of sight cone is basically a line
            const direction = this.positionVector(edge.halfedge.vertex).plus(this.vector(edge.halfedge).times(0.5)).minus(point);
            for (const other_edge of this.mesh.edges) {
                if (other_edge == edge) continue;
                const intersection = this.intersectRayEdge(point, direction, edge);
                if (intersection && (intersection[1] > eps && intersection[1] < 1-eps)) {
                    return false;
                }
            }
            return true;
        }
        const t0 = point;
        const v = this.vector(edge.halfedge).times(eps)
        const t1 = this.positionVector(edge.halfedge.vertex).plus(v);
        const t2 = this.positionVector(edge.halfedge.twin.vertex).minus(v);


        for (const other_edge of this.mesh.edges) {
            if (other_edge == edge) continue;
            const v2 = this.vector(other_edge.halfedge).times(eps)
            const p1 = this.positionVector(other_edge.halfedge.vertex).plus(v2);
            const p2 = this.positionVector(other_edge.halfedge.twin.vertex).minus(v2);
            const result = TriangleEdgeIntersection.Intersecting(p1, p2, t0, t1, t2);
            if (result == INTERSECTING) {
                return false;
            }
        }
        return true;
    }

    insertPointIntoEdge(point, edge) {
        const newVertex = this.mesh.insertVertexIntoEdge(edge);
        this.positions[newVertex] = point;
    }
}

class MyMesh extends Mesh {

    buildFromPolygon(polygonPoints) {
        let nVertices = polygonPoints.length;
        let nEdges = nVertices;
        let nFaces = 0;
        let nHalfedges = 2 * nEdges;

        this.vertices = new Array(nVertices);
        this.edges = new Array(nEdges);
        this.faces = new Array(nFaces);
        this.halfedges = new Array(nHalfedges);

        for (let i = 0; i < polygonPoints.length; i++) {
            const newVertex = new Vertex();
            newVertex.index = i;
            this.vertices[i] = newVertex;

            const newEdge = new Edge();
            newEdge.index = i;
            this.edges[i] = newEdge;
            
            const newHalfedge = new Halfedge();
            newHalfedge.index = i;
            newHalfedge.vertex = newVertex;
            newHalfedge.onBoundary = false;
            newHalfedge.edge = newEdge;
            this.halfedges[i] = newHalfedge;

            newVertex.halfedge = newHalfedge;
            newEdge.halfedge = newHalfedge;
        }
        for (let i = 0; i < nVertices; i++) {
            this.halfedges[i].next = this.halfedges[(i + 1) % nVertices];
            this.halfedges[i].prev = this.halfedges[(nVertices + i - 1) % nVertices];
        }

        const boundaryFace = new Face();
        let boundaryIndex = nVertices;
        for (let i = 0; i < polygonPoints.length; i++) {
            const twin = this.halfedges[i];

            const newBoundaryHalfedge = new Halfedge();
            newBoundaryHalfedge.index = boundaryIndex;
            newBoundaryHalfedge.vertex = twin.next.vertex;
            newBoundaryHalfedge.twin = twin;
            newBoundaryHalfedge.onBoundary = true;
            newBoundaryHalfedge.edge = twin.edge;
            twin.twin = newBoundaryHalfedge;
            newBoundaryHalfedge.face = boundaryFace;

            this.halfedges[boundaryIndex++] = newBoundaryHalfedge;
        }

        for (let i = 0; i < nVertices; i++) {
            const boundaryHalfedge = this.halfedges[nVertices + i];
            boundaryHalfedge.next = boundaryHalfedge.twin.prev.twin;
            boundaryHalfedge.prev = boundaryHalfedge.twin.next.twin;
        }
    }

    addFace() {
        const face =  new Face();
        face.index = this.faces.length;
        this.faces.push(face);
        return face;
    }

    insertVertexIntoEdge(edge) {
        const newHalfedge_straight = new Halfedge();
        newHalfedge_straight.index = this.halfedges.length;
        newHalfedge_straight.debug = "newHalfedge_straight"
        this.halfedges.push(newHalfedge_straight);

        const newHalfedge_twin = new Halfedge();
        newHalfedge_twin.index = this.halfedges.length;
        newHalfedge_twin.debug = "newHalfedge_twin"
        this.halfedges.push(newHalfedge_twin);

        const newVertex = new Vertex();
        newVertex.index = this.vertices.length;
        newVertex.halfedge = newHalfedge_straight;
        this.vertices.push(newVertex);

        const newEdge = new Edge();
        newEdge.index = this.edges.length;
        newEdge.halfedge = newHalfedge_straight;
        this.edges.push(newEdge);

        const halfedge = edge.halfedge;

        newHalfedge_straight.vertex = newVertex;
        newHalfedge_straight.edge = newEdge;
        newHalfedge_straight.face = halfedge.face;
        newHalfedge_straight.twin = halfedge.twin;
        newHalfedge_straight.next = halfedge.next;
        newHalfedge_straight.prev = halfedge;
        newHalfedge_straight.onBoundary = halfedge.onBoundary;

        newHalfedge_twin.vertex = newVertex;
        newHalfedge_twin.edge = halfedge.edge
        newHalfedge_twin.face = halfedge.twin.face
        newHalfedge_twin.twin = halfedge;
        newHalfedge_twin.next = halfedge.twin.next;
        newHalfedge_twin.prev = halfedge.twin;
        newHalfedge_twin.onBoundary = halfedge.twin.onBoundary;

        halfedge.twin.edge = newEdge;

        halfedge.twin.next.prev = newHalfedge_twin;
        halfedge.twin.next = newHalfedge_twin;
        halfedge.next.prev = newHalfedge_straight
        halfedge.next = newHalfedge_straight;

        halfedge.twin.twin = newHalfedge_straight;
        halfedge.twin = newHalfedge_twin;

        return newVertex;
    }

    addEdgeConnectingHalfedges(halfedge_from, halfedge_to) {
        if (halfedge_from.onBoundary || halfedge_to.onBoundary)  {
            throw new Error("Cannot connect boundary edges");
        }
        if (halfedge_from.next.face || halfedge_to.face) {
            //throw new Error("Cannot split existing face");
        }
        const newHalfedge_next = new Halfedge();
        newHalfedge_next.index = this.halfedges.length;
        this.halfedges.push(newHalfedge_next);

        const newHalfedge_twin = new Halfedge();
        newHalfedge_twin.index = this.halfedges.length;
        this.halfedges.push(newHalfedge_twin);

        const newEdge = new Edge();
        newEdge.index = this.edges.length;
        newEdge.halfedge = newHalfedge_next;
        this.edges.push(newEdge);

        newHalfedge_next.vertex = halfedge_from.next.vertex;
        newHalfedge_next.edge = newEdge;
        newHalfedge_next.face = null;//halfedge_from.face;
        newHalfedge_next.twin = newHalfedge_twin;
        newHalfedge_next.next = halfedge_to;
        newHalfedge_next.prev = halfedge_from;
        newHalfedge_next.onBoundary = false;

        newHalfedge_twin.vertex = halfedge_to.vertex;
        newHalfedge_twin.edge = newEdge;
        newHalfedge_twin.face = null;
        newHalfedge_twin.twin = newHalfedge_next;
        newHalfedge_twin.next = halfedge_from.next;
        newHalfedge_twin.prev = halfedge_to.prev;
        newHalfedge_twin.onBoundary = false;

        halfedge_from.next.prev = newHalfedge_twin;
        halfedge_from.next = newHalfedge_next;

        halfedge_to.prev.next = newHalfedge_twin;
        halfedge_to.prev = newHalfedge_next;

        return newHalfedge_next;
    }

    splitHalfEdge(halfedge) {
        if (halfedge.onBoundary) {
            throw new Error("Cannot split boundary edge");
        }
        const new_vertex = new Vertex();
        this.vertices.push(new_vertex);
        new_vertex.index = this.vertices.length - 1;

        const new_face = new Face();
        new_face.debug = "new_face";

        this.faces.push(new_face);
        new_face.index = this.faces.length - 1


        const new_edge_s = new Edge();
        const new_edge_next = new Edge();

        this.edges.push(new_edge_s, new_edge_next);
        new_edge_s.index = this.edges.length - 2;
        new_edge_next.index = this.edges.length - 1;

        const new_halfedge_s = new Halfedge();
        new_halfedge_s.debug = "new_halfedge_s";
        const new_halfedge_twin = new Halfedge();
        new_halfedge_twin.debug = "new_halfedge_twin";

        const new_halfedge_next = new Halfedge();
        new_halfedge_next.debug = "new_halfedge_next";
        const new_halfedge_next_twin = new Halfedge();
        new_halfedge_next_twin.debug = "new_halfedge_next_twin";
        
        new_face.halfedge = new_halfedge_s;

        new_edge_s.halfedge = new_halfedge_s;
        new_edge_next.halfedge = new_halfedge_next;


        this.halfedges.push(new_halfedge_s)
        new_halfedge_s.index = this.halfedges.length - 1;
        new_halfedge_s.vertex = new_vertex;
        new_halfedge_s.edge = new_edge_s;
        new_halfedge_s.face = new_face
        //new_halfedge_s.corner
        new_halfedge_s.next = halfedge.next;
        new_halfedge_s.prev = new_halfedge_next_twin;
        new_halfedge_s.twin = halfedge.twin;
        new_halfedge_s.onBoundary = false;

        this.halfedges.push(new_halfedge_twin)
        new_halfedge_twin.index = this.halfedges.length - 1;
        new_halfedge_twin.vertex = new_vertex;
        new_halfedge_twin.edge = halfedge.edge;
        if (halfedge.twin.onBoundary) {
            new_halfedge_twin.face = halfedge.twin.face;
        }
        //new_halfedge_twin.corner
        new_halfedge_twin.next = halfedge.twin.next;
        if (halfedge.twin.onBoundary) {
            new_halfedge_twin.prev = halfedge.twin;
        }
        new_halfedge_twin.twin = halfedge;
        new_halfedge_twin.onBoundary = halfedge.twin.onBoundary;

        this.halfedges.push(new_halfedge_next)
        new_halfedge_next.index = this.halfedges.length - 1;
        new_halfedge_next.vertex = new_vertex;
        new_halfedge_next.edge = new_edge_next;
        new_halfedge_next.face = halfedge.face;
        //new_halfedge_next.corner
        new_halfedge_next.next = halfedge.next.next;
        new_halfedge_next.prev = halfedge;
        new_halfedge_next.twin = new_halfedge_next_twin;
        new_halfedge_next.onBoundary = false;


        this.halfedges.push(new_halfedge_next_twin)
        new_halfedge_next_twin.index = this.halfedges.length - 1;
        new_halfedge_next_twin.vertex = halfedge.next.next.vertex;
        new_halfedge_next_twin.edge = new_edge_next;
        new_halfedge_next_twin.face = new_face;
        //new_halfedge_next_twin.corner
        new_halfedge_next_twin.next = new_halfedge_s;
        new_halfedge_next_twin.prev = halfedge.next;
        new_halfedge_next_twin.twin = new_halfedge_next;
        new_halfedge_next_twin.onBoundary = false;

        halfedge.twin.edge = new_edge_s;

        halfedge.next.face = new_face;

        if (!halfedge.twin.onBoundary) {
            const new_face_twin = new Face();
            new_face_twin.debug = "new_face_twin";

            this.faces.push(new_face_twin);
            new_face_twin.index = this.faces.length - 1;

            const new_edge_opposite = new Edge();
            this.edges.push(new_edge_opposite);
            new_edge_opposite.index = this.edges.length - 1;

            const new_halfedge_opposite = new Halfedge();
            new_halfedge_opposite.debug = "new_halfedge_opposite";
            const new_halfedge_opposite_twin = new Halfedge();
            new_halfedge_opposite_twin.debug = "new_halfedge_opposite_twin";

            new_face_twin.halfedge = new_halfedge_twin;

            new_edge_opposite.halfedge = new_halfedge_opposite;

            new_halfedge_twin.face = new_face_twin;
            new_halfedge_twin.prev = new_halfedge_opposite_twin;

            this.halfedges.push(new_halfedge_opposite)
            new_halfedge_opposite.index = this.halfedges.length - 1;
            new_halfedge_opposite.vertex = new_vertex;
            new_halfedge_opposite.edge = new_edge_opposite;
            new_halfedge_opposite.face = halfedge.twin.face;
            //new_halfedge_opposite.corner
            new_halfedge_opposite.next = halfedge.twin.prev;
            new_halfedge_opposite.prev = halfedge.twin;
            new_halfedge_opposite.twin = new_halfedge_opposite_twin;
            new_halfedge_opposite.onBoundary = false;

            this.halfedges.push(new_halfedge_opposite_twin)
            new_halfedge_opposite_twin.index = this.halfedges.length - 1;
            new_halfedge_opposite_twin.vertex = halfedge.twin.prev.vertex
            new_halfedge_opposite_twin.edge = new_edge_opposite;
            new_halfedge_opposite_twin.face = new_face_twin;
            //new_halfedge_opposite_twin.corner
            new_halfedge_opposite_twin.next = new_halfedge_twin;
            new_halfedge_opposite_twin.prev = halfedge.twin.next;
            new_halfedge_opposite_twin.twin = new_halfedge_opposite;
            new_halfedge_opposite_twin.onBoundary = false;

            halfedge.twin.next.face = new_face_twin;

            // Don't use prev after here

            halfedge.next.prev = new_halfedge_s;
            halfedge.prev.prev = new_halfedge_next;

            halfedge.twin.next.prev = new_halfedge_twin;
            halfedge.twin.prev.prev = new_halfedge_opposite;

            // Dont use next after here

            halfedge.twin.next.next = new_halfedge_opposite_twin;
            halfedge.next.next = new_halfedge_next_twin;

            halfedge.twin.next = new_halfedge_opposite;
            halfedge.next = new_halfedge_next;
        } else {
            // Don't use prev after here

            halfedge.next.prev = new_halfedge_s;
            halfedge.prev.prev = new_halfedge_next;

            halfedge.twin.next.prev = new_halfedge_twin;
            halfedge.twin.next = new_halfedge_twin;

            // Dont use next after here

            halfedge.next.next = new_halfedge_next_twin;

            halfedge.next = new_halfedge_next;
        }

        halfedge.twin.twin = new_halfedge_s;
        halfedge.twin = new_halfedge_twin;
    }
    
    check(triangular=true, face=true) {
        for (const halfedge of this.halfedges) {
            if(halfedge.next == halfedge) {
                console.log(".next self reference")
            }
            if(halfedge.prev == halfedge) {
                console.log(".prev self reference")
            }
            if (!halfedge.next) {
                console.log(".next undefined", halfedge)
            } else {
                if (halfedge.next.prev !== halfedge) {
                    console.log(".next.prev !== this", halfedge);
                }
                if (triangular && !halfedge.onBoundary && halfedge.next.next.next !== halfedge) {
                    console.log(".next.next.next !== this", halfedge);
                }
                if (halfedge.vertex === halfedge.next.vertex) {
                    console.log("duplicated vertex (next)", halfedge);
                }
                if (halfedge.vertex !== halfedge.twin.next.vertex) {
                    console.log("Vertex is not unique for halfedges touching it (next)", halfedge);
                }
            }
            if (!halfedge.prev) {
                console.log(".prev undefined", halfedge)
            } else {
                if (halfedge.prev.next !== halfedge) {
                    console.log(".prev.next !== this", halfedge);
                }
                if (triangular && !halfedge.onBoundary && halfedge.prev.prev.prev !== halfedge) {
                    console.log(".prev.prev.prev !== this", halfedge);
                }
                if (halfedge.vertex === halfedge.prev.vertex) {
                    console.log("duplicated vertex (prev)", halfedge);
                }
                if (halfedge.vertex !== halfedge.prev.twin.vertex) {
                    console.log("Vertex is not unique for halfedges touching it (prev)", halfedge);
                }
            }
            if (halfedge.twin.twin !== halfedge) {
                console.log(".twin.twin !== this", halfedge);
            }
            if (halfedge.edge !== halfedge.twin.edge) {
                console.log("edge !== twin.edge", halfedge);
            }
            if (face) {
                if (halfedge.face !== halfedge.next.face) {
                    console.log("face !== next.face", halfedge);
                }
                if (halfedge.face) {
                    if (halfedge.face.halfedge && halfedge.face !== halfedge.face.halfedge.face) {
                        console.log("face does not contain halfedge");
                    }
                    if (!halfedge.onBoundary && this.faces[halfedge.face.index] !== halfedge.face) {
                        console.log("Face not found at index", halfedge);
                    }
                } else {
                    console.log("halfedge doesn't have a face");
                }
            }

            if (this.halfedges[halfedge.index] !== halfedge) {
                console.log("Halfedge not found at index", halfedge);
            }
            if (this.vertices[halfedge.vertex.index] !== halfedge.vertex) {
                console.log("Vertice not found at index", halfedge);
            }
            if (this.edges[halfedge.edge.index] !== halfedge.edge) {
                console.log("Edge not found at index", halfedge);
            }
        }
        for (const face of this.faces) {
            if (face.halfedge.face !== face) {
                console.log("Face is present, but not used");
            }
            if (triangular && face.halfedge.next.next.next !== face.halfedge) {
                console.log("Face has more than 3 vertices");
            }
            let halfedge = face.halfedge;
            do {
                if (halfedge.face && halfedge.face != face) {
                    console.log("Halfedges in Face-Loop reference differrent face");
                }
                halfedge = halfedge.next;
            } while(halfedge != face.halfedge);
        }
    }
}



const NOT_INTERSECTING = "NOT_INTERSECTING";
const OVERLAPPING = "OVERLAPPING";
const TOUCHING = "TOUCHING";
const INTERSECTING = "INTERSECTING";
const CONTAINED = "CONTAINED";

class TriangleEdgeIntersection {
    // From https://gamedev.stackexchange.com/a/21110
    /* Check whether P and Q lie on the same side of line AB */
    static Side(p, q, a, b)
    {
        const z1 = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
        const z2 = (b.x - a.x) * (q.y - a.y) - (q.x - a.x) * (b.y - a.y);
        return z1 * z2;
    }

    /* Check whether segment P0P1 intersects with triangle t0t1t2 */
    static Intersecting(p0, p1, t0, t1, t2)
    {
        /* Check whether segment is outside one of the three half-planes
        * delimited by the triangle. */
        const f1 = TriangleEdgeIntersection.Side(p0, t2, t0, t1), f2 = TriangleEdgeIntersection.Side(p1, t2, t0, t1);
        const f3 = TriangleEdgeIntersection.Side(p0, t0, t1, t2), f4 = TriangleEdgeIntersection.Side(p1, t0, t1, t2);
        const f5 = TriangleEdgeIntersection.Side(p0, t1, t2, t0), f6 = TriangleEdgeIntersection.Side(p1, t1, t2, t0);
        /* Check whether triangle is totally inside one of the two half-planes
        * delimited by the segment. */
        const f7 = TriangleEdgeIntersection.Side(t0, t1, p0, p1);
        const f8 = TriangleEdgeIntersection.Side(t1, t2, p0, p1);

        /* If segment is strictly outside triangle, or triangle is strictly
        * apart from the line, we're not intersecting */
        if ((f1 < 0 && f2 < 0) || (f3 < 0 && f4 < 0) || (f5 < 0 && f6 < 0)
            || (f7 > 0 && f8 > 0))
            return NOT_INTERSECTING;
        
        return INTERSECTING; // Treat all other cases as overlapping.

        /* If segment is aligned with one of the edges, we're overlapping */
        if ((f1 == 0 && f2 == 0) || (f3 == 0 && f4 == 0) || (f5 == 0 && f6 == 0))
            return OVERLAPPING;

        /* If segment is outside but not strictly, or triangle is apart but
        * not strictly, we're touching */
        if ((f1 <= 0 && f2 <= 0) || (f3 <= 0 && f4 <= 0) || (f5 <= 0 && f6 <= 0)
            || (f7 >= 0 && f8 >= 0))
            return TOUCHING;

        /* If both segment points are strictly inside the triangle, we
        * are not intersecting either */
        if (f1 > 0 && f2 > 0 && f3 > 0 && f4 > 0 && f5 > 0 && f6 > 0)
            return CONTAINED; // Changed this case to new value CONTAINED

        /* Otherwise we're intersecting with at least one edge */
        return INTERSECTING;
    }
    // End of https://gamedev.stackexchange.com/a/21110
}