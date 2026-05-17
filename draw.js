// Copyright 2026 MaPePeR
// SPDX-License-Identifier: AGPL-3.0-only

const IDW_VERTEX_SHADER = `#version 300 es

in vec2 a_position;
in vec3 a_distance;
out vec3 v_distance;
out vec2 v_pos;
uniform vec2 u_scale;


void main() {
    vec2 scaled = (a_position * vec2(2.0, 2.0) * u_scale - vec2(1.0, 1.0)) * vec2(1, -1);
    gl_Position = vec4(scaled.xy, 0, 1);
    v_pos = a_position;
    v_distance = a_distance;
}
`;

const IDW_FRAGMENT_SHADER = `#version 300 es

precision highp float;
in vec3 v_distance;
in vec2 v_pos;
out float outColor;
uniform float u_maxDistance;
uniform float u_sensorValue;

void main() {
    vec2 d = v_pos - v_distance.xy;
    float l = (length(d) + v_distance.z) / u_maxDistance;
    float v = u_sensorValue / (l * l);
    outColor = v;
}
`;

const COLORIZE_VERTEX_SHADER = `#version 300 es

in vec2 a_position;
out vec2 v_pos;
uniform vec2 u_scale;


void main() {
    vec2 scaled = (a_position * vec2(2.0, 2.0) * u_scale - vec2(1.0, 1.0)) * vec2(1, -1);
    gl_Position = vec4(scaled.xy, 0, 1);
    v_pos = a_position;
}
`;

const COLORIZE_FRAGMENT_SHADER = `#version 300 es

precision highp float;

in vec2 v_pos;
out vec4 outColor;
uniform sampler2D u_value;
uniform sampler2D u_denom;

void main() {
    float v = texture(u_value, v_pos).r;
    float d = texture(u_denom, v_pos).r;
    outColor = vec4(v/d, 0, 0, 1);
}
`

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
    const view = new DataView(buffer);
    
    let pos = 0;
    
    // Uint16 1        Total Vertex Count
    const vertexCount = view.getUint16(pos)
    pos += 16/8;

    // Uint16 1        Total Face Count N_f
    const faceCount = view.getUint16(pos)
    pos += 16/8;

    // Float32 3*N_f   {sourceX, sourceY, sourceDistance}
    const faceDistanceData = new Float32Array(buffer, pos, 3 * faceCount);
    pos += 32/8 * 3 * faceCount;
    
    
    // Uint16 N_f      Vertex Count for face
    const faceVertexCount = new Uint16Array(buffer, pos, faceCount);
    pos += 16/8 * faceCount;


    // Float16 2*N_v   {vertexX, vertexY}
    const vertexPositions = new Float16Array(buffer, pos, 2 * vertexCount);
    pos += 16/8 * vertexCount * 2;

    // Uint16 Sum(N_h) All vertex indices of faces 1..N_f
    const faceData = new Array(faceCount);
    let numberOfVertices = 0;
    for (let i = 0; i < faceCount; i++) {
        const vertexCount = faceVertexCount[i];
        const indices = new Uint16Array(buffer, pos, vertexCount);
        pos += 16/8 * vertexCount;
        faceData[i] = {
            vertexCountBeforeEarcut: vertexCount,
            indices: indices,
            distanceData: faceDistanceData.subarray(i * 3, i * 3 + 3),
            earcutVertices: earcutFace(vertexPositions, indices),
        }
        numberOfVertices += faceData[i].earcutVertices.length;
    }
    const allFaceVertices = new Float16Array(numberOfVertices * 2);
    const allFaceDistanceData = new Float32Array(numberOfVertices * 3);
    let vertexPos = 0;
    for (let i = 0; i < faceCount; i++) {
        const faceVertexCount = faceData[i].earcutVertices.length / 2;
        allFaceVertices.set(faceData[i].earcutVertices, vertexPos * 2)
        
        const distanceData = faceData[i].distanceData;
        
        for (let j = 0; j < faceVertexCount; j++) {
            allFaceDistanceData[vertexPos*3 + j*3 + 0] = distanceData[0];
            allFaceDistanceData[vertexPos*3 + j*3 + 1] = distanceData[1];
            allFaceDistanceData[vertexPos*3 + j*3 + 2] = distanceData[2];
        }

        vertexPos += faceVertexCount;
    }
    return {
        vertexPositions: vertexPositions,
        faces: faceData,
        allFaceVertices: allFaceVertices,
        allFaceDistanceData: allFaceDistanceData,
    }
}

function earcutFace(vertexPositions, indices) {
    const earcutIndices = new Uint16Array(indices.length);
    const earcutInput = new Float16Array(indices.length * 2);
    for(let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        earcutIndices[i] = idx;
        earcutInput[i*2 + 0] = vertexPositions[idx*2 + 0]
        earcutInput[i*2 + 1] = vertexPositions[idx*2 + 1]
    }
    const earcutResult = earcut.default(earcutInput);
    const result = new Float16Array(earcutResult.length * 2)
    for (let i = 0; i < earcutResult.length; i++) {
        result[i*2 + 0] = earcutInput[earcutResult[i]*2 + 0];
        result[i*2 + 1] = earcutInput[earcutResult[i]*2 + 1];
    }
    console.log(result)
    return result;
}

let renderer = null;
function createRenderer(data) {
    const canvasRect = document.querySelector('rect.ha-fp-hm');
    const foreignObjectEl = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
    const canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
    foreignObjectEl.appendChild(canvas);
    foreignObjectEl.setAttribute("x", canvasRect.getAttribute("x"))
    foreignObjectEl.setAttribute("y", canvasRect.getAttribute("y"))
    foreignObjectEl.setAttribute("width", canvasRect.getAttribute("width"))
    foreignObjectEl.setAttribute("height", canvasRect.getAttribute("height"))
    // Insert foreignObject after rect
    canvasRect.parentNode.insertBefore(foreignObjectEl, canvasRect.nextSibling);
    canvas.setAttribute("style","width: 100%; height: 100%;");
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
        this.ctx = canvas.getContext("webgl2");
        this.scale = new Float32Array([data.scaleX, data.scaleY]);
        this.maxDistance = data.maxDistance;
        this.vaos = new Map();
        this.sensorRenderData = new Map();
        this.sensorValues = new Map();
        this.redoDenominatorTexture = true;
        this.valueTexture = null;
        this.denomTexture = null;

        this.valueFrameBuffer = null;
        this.denomFrameBuffer = null;
        
        if (!this.ctx) {
            throw new Error("Couldn't get WebGL2 Context");
        }

        this.ctx_ext_float_color_buffer = this.ctx.getExtension('EXT_color_buffer_float');
        if (!this.ctx_ext_float_color_buffer) {
            throw new Error("Couldn't get 'EXT_color_buffer_float' extension");
        }

        this.ctx_texture_float_linear = this.ctx.getExtension("OES_texture_float_linear");
        if (!this.ctx_texture_float_linear) {
            throw new Error("Couldn't get 'OES_texture_float_linear' extension");
        }


        this.renderTexProgram = createProgram(
            this.ctx,
            IDW_VERTEX_SHADER,
            IDW_FRAGMENT_SHADER,
            ['a_position', 'a_distance'],
            ['u_scale', 'u_maxDistance', 'u_sensorValue'],
        )

        this.colorizeProgram = createProgram(
            this.ctx,
            COLORIZE_VERTEX_SHADER,
            COLORIZE_FRAGMENT_SHADER,
            ['a_position'],
            ['u_value', 'u_denom'],
        )

        this.setupVertexArrayObjects(data);
        const sensorId = this.sensorRenderData.keys().next().value
        this.setSensorValue(sensorId, 1.5);
        this.render();
    }

    setupVertexArrayObjects(data) {

        const sensorMap = new Map();
        for (let areaId in data.areas) {
            if (!Object.hasOwnProperty.call(data.areas, areaId)) {
                continue;
            }
            const area_data = data.areas[areaId];
            for (const sensorId in area_data) {
                if (!Object.hasOwnProperty.call(area_data, sensorId)) {
                    continue;
                }
                const sensorData = area_data[sensorId];
                sensorMap.set(sensorId, readSensorData(sensorData));
            }
        }
        console.log(sensorMap);

        const ctx = this.ctx;
        const positionAttrib = this.renderTexProgram.attributes.get("a_position");
        const distanceAttrib = this.renderTexProgram.attributes.get("a_distance");
        sensorMap.forEach((sensorData, sensorId) => {
            console.log(sensorId, sensorData)
            const vao = ctx.createVertexArray();
            this.vaos.set(sensorId, vao);
            ctx.bindVertexArray(vao);
            
            ctx.enableVertexAttribArray(positionAttrib);

            const vertexBuffer = ctx.createBuffer();
            ctx.bindBuffer(ctx.ARRAY_BUFFER, vertexBuffer);

            ctx.vertexAttribPointer(positionAttrib, 2, ctx.HALF_FLOAT, false, 0, 0);
            ctx.bufferData(ctx.ARRAY_BUFFER, new Float16Array(sensorData.allFaceVertices), ctx.STATIC_DRAW);

            ctx.enableVertexAttribArray(distanceAttrib);

            const distanceBuffer = ctx.createBuffer();
            ctx.bindBuffer(ctx.ARRAY_BUFFER, distanceBuffer);

            ctx.vertexAttribPointer(distanceAttrib, 3, ctx.FLOAT, false, 0, 0);
            ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(sensorData.allFaceDistanceData), ctx.STATIC_DRAW)

            this.sensorRenderData.set(sensorId, {
                vertexCount: sensorData.allFaceVertices.length / 3,
                vertexBuffer: vertexBuffer,
                distanceBuffer: distanceBuffer,
            })
            
        });
        
    }

    setSensorValue(sensorId, value) {
        if (!this.sensorRenderData.has(sensorId)) {
            throw new Error("Unknown sensor id");
        }
        if (!this.sensorValues.has(sensorId)) {
            this.redoDenominatorTexture = true;
        }
        this.sensorValues.set(sensorId, value);
    }

    setupTextures(width, height) {
        if (this.nTexture) {
            this.ctx.deleteTexture(this.nTexture);
        }
        if (this.dTexture) {
            this.ctx.deleteTexture(this.dTexture);
        }

        // use texture unit 0
        this.ctx.activeTexture(this.ctx.TEXTURE0 + 0);

        const createTextureAndAttachToFB = (fb) => {
            const texture = this.ctx.createTexture();

            // bind to the TEXTURE_2D bind point of texture unit 0
            this.ctx.bindTexture(this.ctx.TEXTURE_2D, texture);

            // define size and format of level 0
            const txLevel = 0;
            const internalFormat = this.ctx.RGBA;
            const border = 0;
            const format = this.ctx.RGBA;
            const type = this.ctx.UNSIGNED_BYTE;
            const data = null;
            this.ctx.texImage2D(this.ctx.TEXTURE_2D, txLevel, internalFormat,
                            width, height, border,
                            format, type, data);
        
            // set the filtering so we don't need mips
            this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_MIN_FILTER, this.ctx.LINEAR);
            this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_S, this.ctx.CLAMP_TO_EDGE);
            this.ctx.texParameteri(this.ctx.TEXTURE_2D, this.ctx.TEXTURE_WRAP_T, this.ctx.CLAMP_TO_EDGE);

            this.ctx.bindFramebuffer(this.ctx.FRAMEBUFFER, fb);

            // attach the texture as the first color attachment
            const attachmentPoint = this.ctx.COLOR_ATTACHMENT0;
            const fbLevel = 0;
            this.ctx.framebufferTexture2D(this.ctx.FRAMEBUFFER, attachmentPoint, this.ctx.TEXTURE_2D, texture, fbLevel);

            this.ctx.bindFramebuffer(this.ctx.FRAMEBUFFER, null);

            return texture;
        }

        if (!this.valueFrameBuffer) {
            this.valueFrameBuffer = this.ctx.createFramebuffer();
        }
        if (!this.denomFrameBuffer) {
            this.denomFrameBuffer = this.ctx.createFramebuffer();
        }

        this.denomTexture = createTextureAndAttachToFB(this.denomFrameBuffer);
        this.valueTexture = createTextureAndAttachToFB(this.valueFrameBuffer);
    }

    render() {
        if (this.sensorValues.size == 0) {
            return;
        }
        requestAnimationFrame(() => {
            const ctx = this.ctx;
            const rect = this.canvas.getBoundingClientRect()
            
            rect.width = Math.floor(rect.width)
            rect.height = Math.floor(rect.height)

            if (this.canvas.width != rect.width || this.canvas.height != rect.height) {
                console.log(`Resizing canvas from ${this.canvas.width}, ${this.canvas.height} to ${rect.width}, ${rect.height}`);
                this.canvas.width = rect.width;
                this.canvas.height = rect.height;
                this.setupTextures(rect.width, rect.height);
                this.redoDenominatorTexture = true;
            }

            ctx.useProgram(this.renderTexProgram.prog)

            const scaleUniform = this.renderTexProgram.uniforms.get('u_scale');
            ctx.uniform2fv(scaleUniform, this.scale);

            const maxDistanceUniform = this.renderTexProgram.uniforms.get('u_maxDistance');
            ctx.uniform1f(maxDistanceUniform, this.maxDistance);

            ctx.enable(ctx.BLEND);
            ctx.blendFunc(ctx.ONE, ctx.ONE);

            if (this.redoDenominatorTexture) {
                this.redoDenominatorTexture = false;

                ctx.bindFramebuffer(ctx.FRAMEBUFFER, this.denomFrameBuffer);

                ctx.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
                ctx.clearColor(0,0,0,0);
                ctx.clear(ctx.COLOR_BUFFER_BIT);

                this.sensorValues.forEach((_, sensorId) => {
                    this.drawSensorWithValue(1, sensorId);
                })

            }

            ctx.bindFramebuffer(ctx.FRAMEBUFFER, this.valueFrameBuffer);
            ctx.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.clearColor(0,0,0,0);
            ctx.clear(ctx.COLOR_BUFFER_BIT);

            this.sensorValues.forEach((sensorValue, sensorId) => {
                this.drawSensorWithValue(sensorValue, sensorId);
            });

            ctx.bindFramebuffer(ctx.FRAMEBUFFER, null);
            

            this.sensorValues.forEach((sensorValue, sensorId) => {
                this.drawSensorWithValue(sensorValue, sensorId);
            });

            ctx.disable(ctx.BLEND);

            // TODO: Use sensor with minimum vertices for each area
            // TODO: Use separate shader to calcualte valueTexture / denomTexture and apply colormap
        })
    }

    drawSensorWithValue(sensorValue, sensorId) {
        const sensorValueUniform = this.renderTexProgram.uniforms.get('u_sensorValue');
        this.ctx.uniform1f(sensorValueUniform, sensorValue);

        this.ctx.bindVertexArray(this.vaos.get(sensorId));
        const vertexCount = this.sensorRenderData.get(sensorId).vertexCount
        console.log("Drawing ", sensorId, sensorValue, vertexCount);
        this.ctx.drawArrays(this.ctx.TRIANGLES, 0, vertexCount);
    }
}