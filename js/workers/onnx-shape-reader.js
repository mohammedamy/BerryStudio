/* ============================================================
   Minimal ONNX (protobuf) graph-input/output shape reader —
   BerryStudio-Upgrade-Plan-v2.0 WP-21.

   onnxruntime-web's own JS `InferenceSession` API does NOT expose static
   input/output shape metadata — confirmed empirically against a real
   onnxruntime-web@1.20.1 WASM session: `session.inputMetadata` simply
   doesn't exist on either the session or its internal handler, and
   neither does anything else on their prototypes; only `inputNames`/
   `outputNames` (name lists, no shapes) do. The declared shape is still
   a real, static property of the .onnx file itself (ModelProto.graph's
   ValueInfoProto entries) — reading it directly from bytes already in
   memory is more correct than depending on a runtime API that turned
   out not to exist, and was caught by an actual end-to-end test against
   a real model, not assumed. This is a small, hand-rolled protobuf
   wire-format reader (varint/length-delimited fields only — everything
   ONNX's proto3 schema uses for the messages below) rather than a
   pulled-in protobuf library, matching this app's "no dependency
   creep" rule for a narrowly-scoped need. Field numbers are from ONNX's
   published onnx.proto3 schema (ModelProto.graph=7; GraphProto.input=11/
   output=12; ValueInfoProto.name=1/type=2; TypeProto.tensor_type=1 (a
   oneof case); TypeProto.Tensor.elem_type=1/shape=2;
   TensorShapeProto.dim=1; Dimension.dim_value=1/dim_param=2).
   ============================================================ */

// ONNX TensorProto.DataType -> {ortType, TypedArray} for the element
// types this reader can actually synthesize a zero-filled input tensor
// for. Types not listed (STRING, COMPLEX64/128, BFLOAT16, and other
// exotic/rare ones) are real ONNX types this deliberately doesn't
// support synthesizing — the caller reports that honestly rather than
// guessing at a byte layout. float16 (10) has no dedicated JS typed
// array in the runtimes this app targets yet, but its zero bit pattern
// is identical to a plain zeroed Uint16Array, which is exactly what
// onnxruntime-web's JS API expects backing a 'float16' Tensor.
export const ONNX_ELEM_TYPES = {
  1: { ortType: 'float32', TypedArray: Float32Array },
  2: { ortType: 'uint8', TypedArray: Uint8Array },
  3: { ortType: 'int8', TypedArray: Int8Array },
  4: { ortType: 'uint16', TypedArray: Uint16Array },
  5: { ortType: 'int16', TypedArray: Int16Array },
  6: { ortType: 'int32', TypedArray: Int32Array },
  7: { ortType: 'int64', TypedArray: BigInt64Array },
  9: { ortType: 'bool', TypedArray: Uint8Array },
  10: { ortType: 'float16', TypedArray: Uint16Array },
  11: { ortType: 'float64', TypedArray: Float64Array },
  12: { ortType: 'uint32', TypedArray: Uint32Array },
  13: { ortType: 'uint64', TypedArray: BigUint64Array },
};

class ByteReader {
  constructor(bytes) { this.view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); this.pos = 0; }
  get done() { return this.pos >= this.view.length; }
  readByte() { return this.view[this.pos++]; }
  readVarint() {
    let result = 0n, shift = 0n;
    for (;;) {
      const b = this.readByte();
      result |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7n;
    }
    return result;
  }
  readVarintNumber() { return Number(this.readVarint()); }
  readTag() {
    const tag = this.readVarintNumber();
    return { fieldNumber: tag >>> 3, wireType: tag & 0x7 };
  }
  readLengthDelimited() {
    const len = this.readVarintNumber();
    const slice = this.view.subarray(this.pos, this.pos + len);
    this.pos += len;
    return slice;
  }
  skip(wireType) {
    if (wireType === 0) { this.readVarint(); }
    else if (wireType === 1) { this.pos += 8; }
    else if (wireType === 2) { this.readLengthDelimited(); }
    else if (wireType === 5) { this.pos += 4; }
    else throw new Error(`unsupported protobuf wire type ${wireType}`);
  }
}

// Reads every top-level field of one protobuf message into
// { [fieldNumber]: value[] } — repeated fields naturally accumulate as
// arrays since any field number can legally appear more than once.
// Varint fields store a Number; length-delimited fields (strings,
// nested messages) store the raw Uint8Array slice, uninterpreted — the
// caller decides how to read it per the specific message schema.
function readFields(bytes) {
  const reader = new ByteReader(bytes);
  const fields = {};
  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    let value;
    if (wireType === 0) value = reader.readVarintNumber();
    else if (wireType === 2) value = reader.readLengthDelimited();
    else { reader.skip(wireType); continue; }
    (fields[fieldNumber] ||= []).push(value);
  }
  return fields;
}

function textDecode(bytes) { return new TextDecoder('utf-8').decode(bytes); }

function readDimension(bytes) {
  const f = readFields(bytes);
  if (f[1] !== undefined) return { value: f[1][0], param: null }; // dim_value (varint)
  if (f[2] !== undefined) return { value: null, param: textDecode(f[2][0]) }; // dim_param (string)
  return { value: null, param: null }; // present but empty — a real, if unusual, dynamic dim
}
function readShape(bytes) {
  const f = readFields(bytes);
  return (f[1] || []).map(readDimension); // TensorShapeProto.dim, repeated
}
function readTensorType(bytes) {
  const f = readFields(bytes);
  const elemType = f[1] !== undefined ? f[1][0] : 0;
  const shape = f[2] ? readShape(f[2][0]) : [];
  return { elemType, shape };
}
function readTypeProto(bytes) {
  const f = readFields(bytes);
  // oneof `value` — field 1 (tensor_type) is the only case this reader
  // understands; sequence/map/optional/sparse-tensor types use other
  // field numbers and aren't handled — a graph I/O of one of those is
  // reported with elemType 0 / no shape, exactly as if it were simply
  // absent, never guessed at.
  if (!f[1]) return { elemType: 0, shape: [] };
  return readTensorType(f[1][0]);
}
function readValueInfo(bytes) {
  const f = readFields(bytes);
  const name = f[1] ? textDecode(f[1][0]) : '';
  const type = f[2] ? readTypeProto(f[2][0]) : { elemType: 0, shape: [] };
  return { name, elemType: type.elemType, shape: type.shape };
}

// { inputs: [{name, elemType, shape}], outputs: [...] } — `shape` is an
// array of { value: number|null, param: string|null } per dimension
// (a dynamic dim has value:null; both null means present-but-empty, a
// valid if unusual encoding some exporters produce).
export function readOnnxGraphIO(bytes) {
  const model = readFields(bytes);
  const graphBytes = model[7] && model[7][0]; // ModelProto.graph
  if (!graphBytes) return { inputs: [], outputs: [] };
  const graph = readFields(graphBytes);
  const inputs = (graph[11] || []).map(readValueInfo); // GraphProto.input
  const outputs = (graph[12] || []).map(readValueInfo); // GraphProto.output
  return { inputs, outputs };
}
