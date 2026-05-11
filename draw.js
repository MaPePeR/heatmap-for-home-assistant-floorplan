// Copyright 2026 MaPePeR
// SPDX-License-Identifier: AGPL-3.0-only

const SPACE_TRANSFORM_VERTEX_SHADER = `#version 300 es

in vec2 a_position;
in float a_distance;
out float v_distance;
void main() {
    gl_Position = vec4(a_position, 0, 1);
    v_distance = a_distance;
}
`;

const BASIC_FRAGMENT_SHADER = `#version 300 es

precision highp float;
in float v_distance;
out vec4 outColor;

void main() {
  outColor = vec4(v_distance, v_distance, 0, 1);
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

        this.vertexBuffer = this.ctx.createBuffer();
        this.vertexArray = this.ctx.createVertexArray();
        
        this.ctx.bindVertexArray(this.vertexArray);
        this.ctx.enableVertexAttribArray(this.renderTexProgram.attributes.get("a_position"));
        this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, this.vertexBuffer);
        this.ctx.vertexAttribPointer(
            this.renderTexProgram.attributes.get("a_position"),
            2, this.ctx.FLOAT,
            false, 0, 0
        )
        this.ctx.bufferData(this.ctx.ARRAY_BUFFER, new Float32Array(this.areaTex.get('area').v), this.ctx.STATIC_DRAW)

        this.triangleBuffer = this.ctx.createBuffer();
        this.ctx.bindBuffer(this.ctx.ELEMENT_ARRAY_BUFFER, this.triangleBuffer);
        this.ctx.bufferData(this.ctx.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.areaTex.get('area').f), this.ctx.STATIC_DRAW)

        this.distanceBuffer = this.ctx.createBuffer();
        this.ctx.enableVertexAttribArray(this.renderTexProgram.attributes.get("a_distance"));
        this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, this.distanceBuffer);
        this.ctx.vertexAttribPointer(
            this.renderTexProgram.attributes.get("a_distance"),
            1, this.ctx.FLOAT,
            false, 0, 0
        )
        this.ctx.bufferData(this.ctx.ARRAY_BUFFER, new Float32Array(this.sensorData.get("examplesensor")), this.ctx.STATIC_DRAW)

        this.render()
    }

    render() {
        requestAnimationFrame(() => {
            const ctx = this.ctx;
            const rect = this.canvas.getBoundingClientRect()
            if (this.canvas.width != rect.width || this.canvas.height != rect.height) {
                this.canvas.width = rect.width;
                this.canvas.height = rect.height;
            }
            ctx.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.clearColor(0,0,0,0);
            ctx.clear(ctx.COLOR_BUFFER_BIT);
            
            ctx.useProgram(this.renderTexProgram.prog)

            ctx.bindVertexArray(this.vertexArray);

            ctx.drawElements(ctx.TRIANGLES, this.areaTex.get('area').f.length, ctx.UNSIGNED_SHORT, 0);
        })
    }
}