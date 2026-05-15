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
        return this.positions[vertex.index];
    }

    angleBetweenVectors(v1, v2) {
        v1 = v1.unit();
        v2 = v2.unit();
        // https://stackoverflow.com/a/16544330
        const dot = v1.x*v2.x + v1.y*v2.y;
        const det = v1.x*v2.y - v1.y*v2.x;
        return Math.atan2(-det, -dot) + Math.PI;
    }

    smallestAngleBetweenVectors(v1, v2) {
        v1 = v1.unit();
        v2 = v2.unit();
        // https://stackoverflow.com/a/16544330
        const dot = v1.x*v2.x + v1.y*v2.y;
        const det = v1.x*v2.y - v1.y*v2.x;
        return Math.atan2(det, dot)
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

    check() {
        this.mesh.check();
        let cwCount = 0;
        let ccwCount = 0;
        for (const halfedge of this.mesh.halfedges) {
            if (halfedge.onBoundary) continue;
            const c = this.centroid(halfedge.face);
            const angle = this.smallestAngleBetweenVectors(this.positionVector(halfedge.vertex).minus(c), this.positionVector(halfedge.next.vertex).minus(c))
            if (angle < 0) {
                console.log("halfedge next is clockwise instead of counterclockwise", halfedge)
                cwCount += 1
            } else {
                ccwCount +=1;
            }
        }
        console.log("CCW:", ccwCount, "CW:", cwCount)
    }
}

class MyMesh extends Mesh {
    
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
    
    check() {
        for (const halfedge of this.halfedges) {
            if(halfedge.next == halfedge) {
                console.log(".next self reference")
            }
            if(halfedge.prev == halfedge) {
                console.log(".prev self reference")
            }
            if (halfedge.next.prev !== halfedge) {
                console.log(".next.prev !== this", halfedge);
            }
            if (halfedge.prev.next !== halfedge) {
                console.log(".prev.next !== this", halfedge);
            }
            if (!halfedge.onBoundary && halfedge.next.next.next !== halfedge) {
                console.log(".next.next.next !== this", halfedge);
            }
            if (!halfedge.onBoundary && halfedge.prev.prev.prev !== halfedge) {
                console.log(".prev.prev.prev !== this", halfedge);
            }
            if (halfedge.twin.twin !== halfedge) {
                console.log(".twin.twin !== this", halfedge);
            }
            if (halfedge.edge !== halfedge.twin.edge) {
                console.log("edge !== twin.edge", halfedge);
            }
            if (halfedge.face !== halfedge.next.face) {
                console.log("face !== next.face", halfedge);
            }
            if (halfedge.face !== halfedge.face.halfedge.face) {
                console.log("face does not contain halfedge");
            }
            if (halfedge.vertex === halfedge.next.vertex || halfedge.vertex === halfedge.prev.vertex) {
                console.log("duplicated vertex", halfedge);
            }
            if (this.halfedges[halfedge.index] !== halfedge) {
                console.log("Halfedge not found at index", halfedge);
            }
            if (this.vertices[halfedge.vertex.index] !== halfedge.vertex) {
                console.log("Vertice not found at index", halfedge);
            }
            if (!halfedge.onBoundary && this.faces[halfedge.face.index] !== halfedge.face) {
                console.log("Face not found at index", halfedge);
            }
            if (this.edges[halfedge.edge.index] !== halfedge.edge) {
                console.log("Edge not found at index", halfedge);
            }
            if (halfedge.vertex !== halfedge.twin.next.vertex) {
                console.log("Vertex is not unique for halfedges touching it (next)", halfedge);
            }
            if (halfedge.vertex !== halfedge.prev.twin.vertex) {
                console.log("Vertex is not unique for halfedges touching it (prev)", halfedge);
            }
        }
        for (const face of this.faces) {
            if (face.halfedge.face !== face) {
                console.log("Face is present, but not used");
            }
            if (face.halfedge.next.next.next !== face.halfedge) {
                console.log("Face has more than 3 vertices");
            }
        }
    }
}