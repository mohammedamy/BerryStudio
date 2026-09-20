// Bounded, declarative pattern-program executor. It deliberately accepts no
// code, loops, branches or arbitrary object fields.
const clone = value => JSON.parse(JSON.stringify(value));
const name = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value);
const formula = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && /^[A-Za-z0-9_+\-*/().\s]+$/.test(value);
const point = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
const fail = code => { throw new Error(code); };

function evaluate(source, lookup) {
  const tokens = String(source).match(/[A-Za-z_][A-Za-z0-9_]*|\d+\.?\d*|\.\d+|[()+\-*/]/g) || [];
  if (!tokens.length || tokens.join('') !== String(source).replace(/\s/g, '')) fail('programFormula');
  let at = 0;
  const peek = () => tokens[at]; const next = () => tokens[at++];
  const atom = () => {
    const token = next();
    if (token === '(') { const value = expression(); if (next() !== ')') fail('programFormula'); return value; }
    if (/^[0-9.]/.test(token || '')) return Number(token);
    const value = lookup(token); if (!Number.isFinite(value)) fail('programFormula'); return value;
  };
  const unary = () => { if (peek() === '-' || peek() === '+') return next() === '-' ? -unary() : unary(); return atom(); };
  const term = () => { let value = unary(); while (peek() === '*' || peek() === '/') { const op = next(); const right = unary(); if (op === '/' && right === 0) fail('programFormula'); value = op === '*' ? value * right : value / right; } return value; };
  const expression = () => { let value = term(); while (peek() === '+' || peek() === '-') value = next() === '+' ? value + term() : value - term(); return value; };
  const result = expression(); if (at !== tokens.length || !Number.isFinite(result) || Math.abs(result) > 10000) fail('programFormula'); return result;
}

export function validatePatternProgram(program) {
  if (!program || program.version !== 1 || Object.keys(program).some(key => !['version','family','operations'].includes(key)) || program.family !== 'woven-a-line-skirt' || !Array.isArray(program.operations) || program.operations.length < 1 || program.operations.length > 60) fail('programInvalid');
  const known = new Set(['waist','hips','chest','height','inseam']); const points = new Set(); const pieces = new Set();
  for (const op of program.operations) {
    if (!op || typeof op !== 'object' || Array.isArray(op)) fail('programInvalid');
    if (op.op === 'defineVariable') {
      if (Object.keys(op).some(key => !['op','name','formula'].includes(key)) || !name(op.name) || !formula(op.formula) || known.has(op.name)) fail('programInvalid');
      known.add(op.name);
    } else if (op.op === 'placePoint') {
      if (Object.keys(op).some(key => !['op','name','x','y'].includes(key)) || !name(op.name) || !formula(op.x) || !formula(op.y) || known.has(op.name)) fail('programInvalid');
      known.add(op.name); points.add(op.name);
    } else if (op.op === 'lineBetween') {
      if (Object.keys(op).some(key => !['op','name','from','to'].includes(key)) || !name(op.name) || !name(op.from) || !name(op.to) || !points.has(op.from) || !points.has(op.to) || op.from === op.to || known.has(op.name)) fail('programInvalid');
      known.add(op.name);
    } else if (op.op === 'promotePiece') {
      if (Object.keys(op).some(key => !['op','id','name','nameAr','pointLoop','grain'].includes(key)) || !name(op.id) || typeof op.name !== 'string' || !op.name.trim() || op.name.length > 120 || typeof op.nameAr !== 'string' || !op.nameAr.trim() || op.nameAr.length > 120 || !Array.isArray(op.pointLoop) || op.pointLoop.length < 3 || op.pointLoop.length > 20 || new Set(op.pointLoop).size !== op.pointLoop.length || !op.pointLoop.every(p => name(p) && points.has(p)) || !Array.isArray(op.grain) || op.grain.length !== 2 || !op.grain.every(p => name(p) && points.has(p)) || pieces.has(op.id)) fail('programInvalid');
      pieces.add(op.id);
    } else if (op.op === 'setPieceRole') {
      if (Object.keys(op).some(key => !['op','piece','role','cutOnFold','quantity'].includes(key)) || !pieces.has(op.piece) || !['skirt-front','skirt-back','waistband'].includes(op.role) || typeof op.cutOnFold !== 'boolean' || !Number.isInteger(op.quantity) || op.quantity < 1 || op.quantity > 4) fail('programInvalid');
    } else fail('programInvalid');
  }
  return true;
}

export function executePatternProgram(program, measurements) {
  validatePatternProgram(program);
  if (!measurements || !['waist','hips'].every(key => Number.isFinite(measurements[key]) && measurements[key] > 20 && measurements[key] < 200)) fail('programMeasurements');
  const values = Object.assign(Object.create(null), measurements), points = Object.create(null), lines = [], pieces = [];
  for (const op of program.operations) {
    if (op.op === 'defineVariable') values[op.name] = evaluate(op.formula, key => values[key]);
    else if (op.op === 'placePoint') points[op.name] = [evaluate(op.x, key => values[key]), evaluate(op.y, key => values[key])];
    else if (op.op === 'lineBetween') lines.push({name:op.name,from:op.from,to:op.to});
    else if (op.op === 'promotePiece') {
      const outline = op.pointLoop.map(key => points[key]); const grain = op.grain.map(key => points[key]);
      if (outline.some(value => !point(value)) || grain.some(value => !point(value))) fail('programInvalid');
      pieces.push({ key:op.id, name:{en:op.name,ar:op.nameAr}, outline:clone(outline), grain:clone(grain), darts:[], notches:[], curves:[], visible:true, locked:false });
    } else {
      const piece = pieces.find(item => item.key === op.piece); if (!piece) fail('programInvalid');
      piece.role = op.role; piece.cutOnFold = op.cutOnFold; piece.quantity = op.quantity;
    }
  }
  if (!pieces.length || pieces.some(piece => !piece.role)) fail('programInvalid');
  return {pieces,points:clone(points),lines:clone(lines),variables:Object.fromEntries(Object.entries(values).filter(([key]) => !Object.hasOwn(measurements,key)))};
}

export function createWovenALineSkirtProgram(length) {
  const skirtLength = ({short:45,regular:60,long:85})[length]; if (!skirtLength) fail('programInvalid');
  return {version:1,family:'woven-a-line-skirt',operations:[
    {op:'defineVariable',name:'waistQuarter',formula:'waist/4+1'}, {op:'defineVariable',name:'hipQuarter',formula:'hips/4+2.5'},
    {op:'defineVariable',name:'hemQuarter',formula:'hipQuarter+8'}, {op:'defineVariable',name:'skirtLength',formula:String(skirtLength)}, {op:'defineVariable',name:'waistbandHeight',formula:'4'},
    {op:'placePoint',name:'frontFoldWaist',x:'0',y:'0'}, {op:'placePoint',name:'frontSideWaist',x:'waistQuarter',y:'0'}, {op:'placePoint',name:'frontSideHem',x:'hemQuarter',y:'skirtLength'}, {op:'placePoint',name:'frontFoldHem',x:'0',y:'skirtLength'}, {op:'placePoint',name:'frontGrainTop',x:'waistQuarter/2',y:'5'}, {op:'placePoint',name:'frontGrainBottom',x:'waistQuarter/2',y:'skirtLength-5'},
    {op:'lineBetween',name:'frontSideSeam',from:'frontSideWaist',to:'frontSideHem'}, {op:'promotePiece',id:'front',name:'A-line skirt front',nameAr:'أمام تنورة بقصة A',pointLoop:['frontFoldWaist','frontSideWaist','frontSideHem','frontFoldHem'],grain:['frontGrainTop','frontGrainBottom']}, {op:'setPieceRole',piece:'front',role:'skirt-front',cutOnFold:true,quantity:1},
    {op:'placePoint',name:'backFoldWaist',x:'0',y:'skirtLength+12'}, {op:'placePoint',name:'backSideWaist',x:'waistQuarter',y:'skirtLength+12'}, {op:'placePoint',name:'backSideHem',x:'hemQuarter',y:'skirtLength*2+12'}, {op:'placePoint',name:'backFoldHem',x:'0',y:'skirtLength*2+12'}, {op:'placePoint',name:'backGrainTop',x:'waistQuarter/2',y:'skirtLength+17'}, {op:'placePoint',name:'backGrainBottom',x:'waistQuarter/2',y:'skirtLength*2+7'},
    {op:'lineBetween',name:'backSideSeam',from:'backSideWaist',to:'backSideHem'}, {op:'promotePiece',id:'back',name:'A-line skirt back',nameAr:'خلف تنورة بقصة A',pointLoop:['backFoldWaist','backSideWaist','backSideHem','backFoldHem'],grain:['backGrainTop','backGrainBottom']}, {op:'setPieceRole',piece:'back',role:'skirt-back',cutOnFold:true,quantity:1},
    {op:'placePoint',name:'bandLeft',x:'hemQuarter+12',y:'0'}, {op:'placePoint',name:'bandRight',x:'hemQuarter+12+waist/2+2',y:'0'}, {op:'placePoint',name:'bandBottomRight',x:'hemQuarter+12+waist/2+2',y:'waistbandHeight'}, {op:'placePoint',name:'bandBottomLeft',x:'hemQuarter+12',y:'waistbandHeight'}, {op:'placePoint',name:'bandGrainTop',x:'hemQuarter+15',y:'waistbandHeight/2'}, {op:'placePoint',name:'bandGrainBottom',x:'hemQuarter+12+waist/2-1',y:'waistbandHeight/2'},
    {op:'promotePiece',id:'waistband',name:'Waistband',nameAr:'حزام الخصر',pointLoop:['bandLeft','bandRight','bandBottomRight','bandBottomLeft'],grain:['bandGrainTop','bandGrainBottom']}, {op:'setPieceRole',piece:'waistband',role:'waistband',cutOnFold:false,quantity:2},
  ]};
}
