// Copyright 2026 MaPePeR
// SPDX-License-Identifier: AGPL-3.0-only

class MyGeometry extends Geometry {
    splitHalfEdgeAtRatio(halfedge, ratio) {
        if (ratio <= 0 || ratio >= 1) {
            throw new Error("Ratio has to be between 0 and 1");
        }

        const pos1 = halfedge.vertex;
        const pos2 = halfedge.next.vertex;
        const new_pos = pos1.plus(pos2.minus(pos1).multiply(ratio))
        this.mesh.splitHalfEdge(halfedge);
        this.positions[halfedge.next.vertex.index] = new_pos;
    }
}

class MyMesh extends Mesh {
    
    splitHalfEdge(halfedge) {
        if (halfedge.onBoundary || halfedge.twin.onBoundary) {
            throw new Error("Cannot split boundary edge");
        }
        const new_vertex = new Vertex();
        this.vertices.push(new_vertex);
        new_vertex.index = this.vertices.length - 1;

        const new_face = new Face();
        new_face.debug = "new_face";
        const new_face_twin = new Face();
        new_face_twin.debug = "new_face_twin";

        this.faces.push(new_face, new_face_twin);
        new_face.index = this.faces.length - 2;
        new_face_twin.index = this.faces.length - 1;

        const new_edge_s = new Edge();
        const new_edge_next = new Edge();
        const new_edge_opposite = new Edge();

        this.edges.push(new_edge_s, new_edge_next, new_edge_opposite);
        new_edge_s.index = this.edges.length - 3;
        new_edge_next.index = this.edges.length - 2;
        new_edge_opposite.index = this.edges.length - 1;

        const new_halfedge_s = new Halfedge();
        new_halfedge_s.debug = "new_halfedge_s";
        const new_halfedge_twin = new Halfedge();
        new_halfedge_twin.debug = "new_halfedge_twin";

        const new_halfedge_next = new Halfedge();
        new_halfedge_next.debug = "new_halfedge_next";
        const new_halfedge_next_twin = new Halfedge();
        new_halfedge_next_twin.debug = "new_halfedge_next_twin";
        
        const new_halfedge_opposite = new Halfedge();
        new_halfedge_opposite.debug = "new_halfedge_opposite";
        const new_halfedge_opposite_twin = new Halfedge();
        new_halfedge_opposite_twin.debug = "new_halfedge_opposite_twin";


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
        new_halfedge_twin.face = new_face_twin;
        //new_halfedge_twin.corner
        new_halfedge_twin.next = halfedge.twin.next;
        new_halfedge_twin.prev = new_halfedge_opposite_twin;
        new_halfedge_twin.twin = halfedge;
        new_halfedge_twin.onBoundary = false;

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

        halfedge.twin.edge = new_edge_s;

        halfedge.next.face = new_face;
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

        halfedge.twin.twin = new_halfedge_s;
        halfedge.twin = new_halfedge_twin;

        
    }
    
    check() {
        for (const halfedge of this.halfedges) {
            if (halfedge.onBoundary) {
                continue;
            }
            if (halfedge.next.prev !== halfedge) {
                console.log(".next.prev !== this", halfedge);
            }
            if (halfedge.prev.next !== halfedge) {
                console.log(".prev.next !== this", halfedge);
            }
            if (halfedge.next.next.next !== halfedge) {
                console.log(".next.next.next !== this", halfedge);
            }
            if (halfedge.prev.prev.prev !== halfedge) {
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
            if (halfedge.vertex === halfedge.next.vertex || halfedge.vertex === halfedge.prev.vertex) {
                console.log("duplicated vertex", halfedge);
            }
            if (this.halfedges[halfedge.index] !== halfedge) {
                console.log("Halfedge not found at index", halfedge);
            }
            if (this.vertices[halfedge.vertex.index] !== halfedge.vertex) {
                console.log("Vertice not found at index", halfedge);
            }
            if (this.faces[halfedge.face.index] !== halfedge.face) {
                console.log("Face not found at index", halfedge);
            }
            if (this.edges[halfedge.edge.index] !== halfedge.edge) {
                console.log("Edge not found at index", halfedge);
            }
        }
    }
}