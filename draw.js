// Copyright 2026 MaPePeR
// SPDX-License-Identifier: AGPL-3.0-only

const SPACE_TRANSFORM_VERTEX_SHADER = `#version 300 es
in vec4 a_position;
in float a_distance;
uniform mat4 u_matrix;
out float v_distance;
void main() {
  gl_Position = u_matrix * a_position;
  v_distance = a_distance;
}
`;

const BASIC_FRAGMENT_SHADER = `#version 300 es

precision highp float;
in float v_distance;
out vec3 outColor;

void main() {
  outColor = vec3(v_distance);
}
`;

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
    const canvas = document.querySelector('foreignObject > canvas.ha-fp-hm');
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    renderer = new Renderer(data, canvas);
}

function compileShader(ctx, code, type) {
    const shader = ctx.createShader(type);
    ctx.shaderSource(shader, code);
    ctx.compileShader(shader);
    if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS)) {
        throw new Error(`Failed to compile ${type == ctx.VERTEX_SHADER ? "vertex" : "fragment"} shader: ${ctx.getShaderInfoLog(shader)}`);
    }
    return shader;
}

function createProgram(ctx, vertex_code, fragment_code, attributes, uniforms) {
    const program = ctx.createProgram()
    ctx.attachShader(program, compileShader(ctx, vertex_code, ctx.VERTEX_SHADER));
    ctx.attachShader(program, compileShader(ctx, fragment_code, ctx.FRAGMENT_SHADER));

    ctx.linkProgram(program);

    if (!ctx.getProgramParameter(program, ctx.LINK_STATUS)) {
        throw new Error(`Error linking shader program: ${ctx.getProgramInfoLog(program)}`);
    }
    const found_attributes = new Map();
    for (const attribute of attributes) {
        const loc = ctx.getAttribLocation(program, attribute);
        if (loc < 0) {
            throw new Error(`Cannot find attribute ${attribute}`)
        }
        found_attributes.set(attribute, loc)
    }
    const found_uniforms = new Map();
    for (const uniform of uniforms) {
        const loc = ctx.getUniformLocation(program, uniform);
        if (!loc) {
            throw new Error(`Cannot find uniform ${uniform}`)
        }
        found_uniforms.set(uniform, loc)
    }
    return {
        prog: program,
        attributes: found_attributes,
        uniforms: found_uniforms,
    }
}

class Renderer {
    constructor(data, canvas) {
        this.canvas = canvas;
        this.areaTex = new Map();
        this.sensorData = new Map();
        for (let areaId in data) {
            if (!Object.hasOwnProperty.call(data, areaId)) {
                continue;
            }
            const area_data = data[areaId];
            areaId = 'area'
            this.areaTex.set(areaId, readTex(area_data.tex))
            for(const sensorId in area_data.sensors) {
                if (!Object.hasOwnProperty.call(area_data.sensors, sensorId)) {
                    continue;
                }
                this.sensorData.set(sensorId, readSensorData(area_data.sensors[sensorId]))
            }
        }
        this.ctx = canvas.getContext("webgl2");
        if (!this.ctx) {
            throw new Error("Couldn't get WebGL2 Context");
        }
        this.renderTexProgram = createProgram(
            this.ctx,
            SPACE_TRANSFORM_VERTEX_SHADER,
            BASIC_FRAGMENT_SHADER,
            ['a_position', 'a_distance'],
            [],
        )
        this.ctx.clearColor(1,0,0,1)
        this.ctx.clear(this.ctx.DEPTH_BUFFER_BIT | this.ctx.COLOR_BUFFER_BIT)
    }
}