/**
 * The geometry of a model read from a file: vertices, triangles and their
 * material. Fixed once built and shared by everything drawn from it;
 * toObjectData gives the data of an Object3d. A static model draws it as it
 * is, a skinned one (SkinnedMesh) poses it first.
 */
class ModelMesh {
    /**
     * @param {{positions: Float32Array, faces: {indices: int[], material: int}[]}} data - x y z per vertex, indices of
     *        a triangle from 0
     */
    constructor(data) {
        const count = (data.positions.length / ModelMesh.POSITION_SIZE);
        this._check(Number.isInteger(count), 'positions are not x y z triples');
        data.faces.forEach((face, k) => {
            this._check(face.indices.every((index) => ((index >= 0) && (index < count))), 'face ' + k + ' points outside the vertices');
        });

        this._count     = count;
        this._positions = data.positions;
        this._faces     = Object.freeze(data.faces.map((face) => Object.freeze({indices: Object.freeze([...face.indices]), material: face.material})));
        if (new.target === ModelMesh) {
            Object.freeze(this);
        }
    }

    /**
     * The default color of a material: its glTF base color.
     *
     * @param {{color: number[]}} material
     * @returns {number[]} [r, g, b(, alpha)], 0-255 (alpha 0-1, only when below 1)
     */
    static materialColor(material) {
        const [r, g, b, a] = material.color;
        const rgb          = [(r * ModelMesh.CHANNEL_MAX), (g * ModelMesh.CHANNEL_MAX), (b * ModelMesh.CHANNEL_MAX)];

        return ((a < 1) ? [...rgb, a] : rgb);
    }

    getVertexCount() {
        return this._count;
    }

    getFaces() {
        return this._faces;
    }

    /**
     * Object3dLoader data of the mesh as it is (a skinned mesh: its bind pose).
     *
     * @param {{color: number[], doubleSided: boolean}[]} materials
     * @param {function(object): number[]}               materialColor - [r, g, b(, alpha)], 0-255 (alpha 0-1)
     * @param {boolean}                                  mirror        - x negated, the faces turned inside out
     * @returns {{points: number[][], faces: {pts: int[], color: number[], glow?: boolean}[]}} - glow on the faces of a
     *          material whose extras say glow: true
     */
    toObjectData(materials, materialColor, mirror) {
        const sx     = ((mirror) ? -1 : 1);
        const points = [];
        for (let v = 0; v < this._count; v++) {
            const p = (v * ModelMesh.POSITION_SIZE);
            points.push([(this._positions[p] * sx), this._positions[p + 1], this._positions[p + 2]]);
        }
        const faces = [];
        for (const face of this._faces) {
            const [a, b, c] = face.indices.map((index) => (index + 1));
            const material  = materials[face.material];
            const color     = materialColor(material);
            const glow      = ((material.extras !== undefined) && (material.extras !== null) && (material.extras.glow === true));
            faces.push(ModelMesh._faceData(((mirror) ? [a, c, b] : [a, b, c]), color, glow));
            if (material.doubleSided) {
                faces.push(ModelMesh._faceData(((mirror) ? [a, b, c] : [a, c, b]), color, glow));
            }
        }

        return {points, faces};
    }

    // A face of the object data, its colour copied (Object3d.fcAdd rewrites it in place).
    static _faceData(pts, color, glow) {
        const face = {pts: pts, color: [...color]};
        if (glow) {
            face.glow = true;
        }

        return face;
    }

    _check(condition, message) {
        if (!condition) {
            throw new Error(this.constructor.name + ' - ' + message);
        }
    }
}

ModelMesh.POSITION_SIZE = 3;
// Face colors of Object3d: 0-255.
ModelMesh.CHANNEL_MAX   = 255;
