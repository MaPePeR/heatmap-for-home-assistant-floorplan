// Copyright 2026 MaPePeR
// SPDX-License-Identifier: AGPL-3.0-only

const SPACE_TRANSFORM_VERTEX_SHADER = `#version 300 es

in vec2 a_position;
in vec3 a_distance;
out vec3 v_distance;
out vec2 v_barycentric;
out vec2 v_pos;

const vec2[3] barycentrics = vec2[3](
    vec2(0.0, 0.0),
    vec2(1.0, 0.0),
    vec2(0.0, 1.0)
);


void main() {
    gl_Position = vec4(a_position, 0, 1);
    v_pos = a_position;
    v_distance = a_distance;
    v_barycentric = barycentrics[gl_VertexID % 3];
}
`;

const BASIC_FRAGMENT_SHADER = `#version 300 es

precision highp float;
in vec2 v_barycentric;
in vec3 v_distance;
in vec2 v_pos;
out vec4 outColor;

void main() {
    // Calculate distance to edges
    vec3 bary = vec3(v_barycentric.xy, 1.0 - v_barycentric.x - v_barycentric.y);
    
    // Find minimum distance to any edge
    float edgeDist = min(min(bary.x, bary.y), bary.z);
    if (edgeDist < 0.01) {
        outColor = vec4(0,0,0,1);
    } else {
        if (v_distance.z >= 0.0) {
            float l =0.5 * (length(v_pos - v_distance.xy) + v_distance.z);
            outColor = vec4(1, 0.25 + l, 0.25 + l , 1);
            //outColor = vec4(bary.xzy,1);
        } else {
            outColor = vec4(0,0,0,0);
        }

    }
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
            this.sensorData.set(areaId, readSensorData(area_data.sensor))
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

        this.distanceBuffer = this.ctx.createBuffer();
        this.ctx.enableVertexAttribArray(this.renderTexProgram.attributes.get("a_distance"));
        this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, this.distanceBuffer);
        this.ctx.vertexAttribPointer(
            this.renderTexProgram.attributes.get("a_distance"),
            3, this.ctx.FLOAT,
            false, 0, 0
        );
        const incoming_data = this.sensorData.get('area');
       
        const sensorData = new Float32Array(incoming_data.length * 3);
        // Have to duplicate Face data for each vertex? Maybe replace with this.ctx.vertexAttribDivisor? Didn't work so far.
        for(let i = 0; i < incoming_data.length; i+=3) {
            sensorData[i * 3 + 0] = sensorData[i * 3 + 3] = sensorData[i * 3 + 6] = incoming_data[i + 0];
            sensorData[i * 3 + 1] = sensorData[i * 3 + 4] = sensorData[i * 3 + 7] = incoming_data[i + 1];
            sensorData[i * 3 + 2] = sensorData[i * 3 + 5] = sensorData[i * 3 + 8] = incoming_data[i + 2];
        }

        this.ctx.bufferData(this.ctx.ARRAY_BUFFER, new Float32Array(sensorData), this.ctx.STATIC_DRAW)

        this.ctx.enableVertexAttribArray(this.renderTexProgram.attributes.get("a_position"));
        this.ctx.bindBuffer(this.ctx.ARRAY_BUFFER, this.vertexBuffer);
        this.ctx.vertexAttribPointer(
            this.renderTexProgram.attributes.get("a_position"),
            2, this.ctx.FLOAT,
            false, 0, 0
        )
        const v = this.areaTex.get('area').v;
        const f=  this.areaTex.get('area').f;
        this.positions = new Float32Array(f.length * 2);
        for (let i = 0; i < f.length; i++) {
            this.positions[i*2+0] = v[f[i] * 2 + 0];
            this.positions[i*2+1] = v[f[i] * 2 + 1];
        }
        this.ctx.bufferData(this.ctx.ARRAY_BUFFER, new Float32Array(this.positions), this.ctx.STATIC_DRAW)

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

            ctx.drawArrays(ctx.TRIANGLES, 0, this.positions.length / 2);
        })
    }
}