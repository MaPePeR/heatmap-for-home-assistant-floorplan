// Copyright 2026 MaPePeR
// SPDX-License-Identifier: AGPL-3.0-only

function readTex(tex) {
    const buffer = Uint8Array.fromBase64(tex).buffer
    const view = new DataView(buffer)
    const n_vertices = view.getUint16()
    return {
        v: new Float16Array(buffer, 16/8, n_vertices*2),
        f: new Uint16Array(buffer, 16/8 + n_vertices * 2 * 16/8),
    }
}

function readSensorData(data) {
    const buffer = Uint8Array.fromBase64(data).buffer
    return new Float32Array(buffer);
}

let renderer = null;
function createRenderer(data) {
    const canvas = floorplancontainer.querySelector('canvas.ha-fp-hm')
    renderer = new Renderer(data, canvas)
}

class Renderer {
    constructor(data, canvas) {
        this.canvas = canvas;
        this.areaTex = new Map();
        this.sensorData = new Map();
        for (const areaId in data) {
            if (!Object.hasOwnProperty.call(data, areaId)) {
                continue;
            }
            const area_data = data[areaId];
            this.areaTex.set(areaId, readTex(area_data.tex))
            for(const sensorId in area_data.sensors) {
                if (!Object.hasOwnProperty.call(area_data.sensors, sensorId)) {
                    continue;
                }
                this.sensorData.set(sensorId, readSensorData(area_data.sensors[sensorId]))
            }
        }
    }
}