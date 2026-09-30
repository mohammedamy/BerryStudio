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
  const rolesByFamily={
    'woven-a-line-skirt':['skirt-front','skirt-back','waistband'],
    'woven-basic-bodice':['bodice-front','bodice-back'],
    'woven-basic-dress':['bodice-front','bodice-back','skirt-front','skirt-back'],
  };
  if (!program || program.version !== 1 || Object.keys(program).some(key => !['version','family','operations'].includes(key)) || !Object.hasOwn(rolesByFamily,program.family) || !Array.isArray(program.operations) || program.operations.length < 1 || program.operations.length > 60) fail('programInvalid');
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
      if (Object.keys(op).some(key => !['op','piece','role','cutOnFold','quantity'].includes(key)) || !pieces.has(op.piece) || !rolesByFamily[program.family].includes(op.role) || typeof op.cutOnFold !== 'boolean' || !Number.isInteger(op.quantity) || op.quantity < 1 || op.quantity > 4) fail('programInvalid');
    } else if (op.op === 'setPieceConstruction') {
      if (Object.keys(op).some(key => !['op','piece','notchPoints','edges'].includes(key)) || !pieces.has(op.piece) || !Array.isArray(op.notchPoints) || !op.notchPoints.every(pointName => name(pointName) && points.has(pointName)) || !Array.isArray(op.edges) || !op.edges.every(edge => edge && typeof edge === 'object' && Object.keys(edge).every(key => ['from','to','seamId'].includes(key)) && name(edge.from) && name(edge.to) && points.has(edge.from) && points.has(edge.to) && edge.from !== edge.to && typeof edge.seamId === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(edge.seamId))) fail('programInvalid');
    } else fail('programInvalid');
  }
  return true;
}

export function executePatternProgram(program, measurements) {
  validatePatternProgram(program);
  const required=program.family==='woven-basic-bodice'?['chest','waist']:['waist','hips','chest'].filter(key=>program.family!=='woven-a-line-skirt'||key!=='chest');
  if (!measurements || !required.every(key => Number.isFinite(measurements[key]) && measurements[key] > 20 && measurements[key] < 200)) fail('programMeasurements');
  const values = Object.assign(Object.create(null), measurements), points = Object.create(null), lines = [], pieces = [];
  for (const op of program.operations) {
    if (op.op === 'defineVariable') values[op.name] = evaluate(op.formula, key => values[key]);
    else if (op.op === 'placePoint') points[op.name] = [evaluate(op.x, key => values[key]), evaluate(op.y, key => values[key])];
    else if (op.op === 'lineBetween') lines.push({name:op.name,from:op.from,to:op.to});
    else if (op.op === 'promotePiece') {
      const outline = op.pointLoop.map(key => points[key]); const grain = op.grain.map(key => points[key]);
      if (outline.some(value => !point(value)) || grain.some(value => !point(value))) fail('programInvalid');
      pieces.push({ key:op.id, name:{en:op.name,ar:op.nameAr}, outline:clone(outline), grain:clone(grain), darts:[], notches:[], curves:[], visible:true, locked:false, _pointIndex:Object.fromEntries(op.pointLoop.map((pointName,index)=>[pointName,index])) });
    } else {
      const piece = pieces.find(item => item.key === op.piece); if (!piece) fail('programInvalid');
      if (op.op === 'setPieceRole') { piece.role = op.role; piece.cutOnFold = op.cutOnFold; piece.quantity = op.quantity; }
      else {
        piece.notches=op.notchPoints.map(pointName=>clone(points[pointName]));
        piece.edges=op.edges.map(edge=>({fromIdx:piece._pointIndex[edge.from],toIdx:piece._pointIndex[edge.to],seamId:edge.seamId}));
      }
    }
  }
  if (!pieces.length || pieces.some(piece => !piece.role)) fail('programInvalid');
  pieces.forEach(piece=>delete piece._pointIndex);
  return {pieces,points:clone(points),lines:clone(lines),variables:Object.fromEntries(Object.entries(values).filter(([key]) => !Object.hasOwn(measurements,key)))};
}

export function createWovenALineSkirtProgram(length) {
  const skirtLength = ({short:45,regular:60,long:85})[length]; if (!skirtLength) fail('programInvalid');
  return {version:1,family:'woven-a-line-skirt',operations:[
    {op:'defineVariable',name:'waistQuarter',formula:'waist/4+1'}, {op:'defineVariable',name:'hipQuarter',formula:'hips/4+2.5'},
    {op:'defineVariable',name:'hemQuarter',formula:'hipQuarter+8'}, {op:'defineVariable',name:'skirtLength',formula:String(skirtLength)}, {op:'defineVariable',name:'waistbandHeight',formula:'4'},
    {op:'placePoint',name:'frontFoldWaist',x:'0',y:'0'}, {op:'placePoint',name:'frontSideWaist',x:'waistQuarter',y:'0'}, {op:'placePoint',name:'frontSideNotch',x:'waistQuarter+(hemQuarter-waistQuarter)/2',y:'skirtLength/2'}, {op:'placePoint',name:'frontSideHem',x:'hemQuarter',y:'skirtLength'}, {op:'placePoint',name:'frontFoldHem',x:'0',y:'skirtLength'}, {op:'placePoint',name:'frontGrainTop',x:'waistQuarter/2',y:'5'}, {op:'placePoint',name:'frontGrainBottom',x:'waistQuarter/2',y:'skirtLength-5'},
    {op:'lineBetween',name:'frontSideSeam',from:'frontSideWaist',to:'frontSideHem'}, {op:'promotePiece',id:'front',name:'A-line skirt front',nameAr:'أمام تنورة بقصة A',pointLoop:['frontFoldWaist','frontSideWaist','frontSideNotch','frontSideHem','frontFoldHem'],grain:['frontGrainTop','frontGrainBottom']}, {op:'setPieceRole',piece:'front',role:'skirt-front',cutOnFold:true,quantity:1}, {op:'setPieceConstruction',piece:'front',notchPoints:['frontSideNotch'],edges:[{from:'frontSideWaist',to:'frontSideHem',seamId:'skirt-side'}]},
    {op:'placePoint',name:'backFoldWaist',x:'0',y:'skirtLength+12'}, {op:'placePoint',name:'backSideWaist',x:'waistQuarter',y:'skirtLength+12'}, {op:'placePoint',name:'backSideNotch',x:'waistQuarter+(hemQuarter-waistQuarter)/2',y:'skirtLength*1.5+12'}, {op:'placePoint',name:'backSideHem',x:'hemQuarter',y:'skirtLength*2+12'}, {op:'placePoint',name:'backFoldHem',x:'0',y:'skirtLength*2+12'}, {op:'placePoint',name:'backGrainTop',x:'waistQuarter/2',y:'skirtLength+17'}, {op:'placePoint',name:'backGrainBottom',x:'waistQuarter/2',y:'skirtLength*2+7'},
    {op:'lineBetween',name:'backSideSeam',from:'backSideWaist',to:'backSideHem'}, {op:'promotePiece',id:'back',name:'A-line skirt back',nameAr:'خلف تنورة بقصة A',pointLoop:['backFoldWaist','backSideWaist','backSideNotch','backSideHem','backFoldHem'],grain:['backGrainTop','backGrainBottom']}, {op:'setPieceRole',piece:'back',role:'skirt-back',cutOnFold:true,quantity:1}, {op:'setPieceConstruction',piece:'back',notchPoints:['backSideNotch'],edges:[{from:'backSideWaist',to:'backSideHem',seamId:'skirt-side'}]},
    {op:'placePoint',name:'bandLeft',x:'hemQuarter+12',y:'0'}, {op:'placePoint',name:'bandRight',x:'hemQuarter+12+waist/2+2',y:'0'}, {op:'placePoint',name:'bandBottomRight',x:'hemQuarter+12+waist/2+2',y:'waistbandHeight'}, {op:'placePoint',name:'bandBottomLeft',x:'hemQuarter+12',y:'waistbandHeight'}, {op:'placePoint',name:'bandGrainTop',x:'hemQuarter+15',y:'waistbandHeight/2'}, {op:'placePoint',name:'bandGrainBottom',x:'hemQuarter+12+waist/2-1',y:'waistbandHeight/2'},
    {op:'promotePiece',id:'waistband',name:'Waistband',nameAr:'حزام الخصر',pointLoop:['bandLeft','bandRight','bandBottomRight','bandBottomLeft'],grain:['bandGrainTop','bandGrainBottom']}, {op:'setPieceRole',piece:'waistband',role:'waistband',cutOnFold:false,quantity:2},
  ]};
}

export function createWovenBasicBodiceProgram() {
  return {version:1,family:'woven-basic-bodice',operations:[
    {op:'defineVariable',name:'chestQuarter',formula:'chest/4+2'}, {op:'defineVariable',name:'waistQuarter',formula:'waist/4+2'}, {op:'defineVariable',name:'bodiceLength',formula:'42'},
    {op:'placePoint',name:'frontNeck',x:'0',y:'8'}, {op:'placePoint',name:'frontShoulder',x:'3',y:'0'}, {op:'placePoint',name:'frontArmhole',x:'chestQuarter-3',y:'0'}, {op:'placePoint',name:'frontUnderarm',x:'chestQuarter',y:'12'}, {op:'placePoint',name:'frontSideWaist',x:'waistQuarter',y:'bodiceLength'}, {op:'placePoint',name:'frontFoldWaist',x:'0',y:'bodiceLength'}, {op:'placePoint',name:'frontGrainTop',x:'waistQuarter/2',y:'12'}, {op:'placePoint',name:'frontGrainBottom',x:'waistQuarter/2',y:'bodiceLength-5'},
    {op:'promotePiece',id:'front',name:'Basic woven bodice front',nameAr:'أمام صدّار منسوج أساسي',pointLoop:['frontNeck','frontShoulder','frontArmhole','frontUnderarm','frontSideWaist','frontFoldWaist'],grain:['frontGrainTop','frontGrainBottom']}, {op:'setPieceRole',piece:'front',role:'bodice-front',cutOnFold:true,quantity:1}, {op:'setPieceConstruction',piece:'front',notchPoints:['frontUnderarm'],edges:[{from:'frontUnderarm',to:'frontSideWaist',seamId:'bodice-side'}]},
    {op:'placePoint',name:'backNeck',x:'0',y:'55'}, {op:'placePoint',name:'backShoulder',x:'3',y:'55'}, {op:'placePoint',name:'backArmhole',x:'chestQuarter-3',y:'55'}, {op:'placePoint',name:'backUnderarm',x:'chestQuarter',y:'67'}, {op:'placePoint',name:'backSideWaist',x:'waistQuarter',y:'bodiceLength+55'}, {op:'placePoint',name:'backFoldWaist',x:'0',y:'bodiceLength+55'}, {op:'placePoint',name:'backGrainTop',x:'waistQuarter/2',y:'67'}, {op:'placePoint',name:'backGrainBottom',x:'waistQuarter/2',y:'bodiceLength+50'},
    {op:'promotePiece',id:'back',name:'Basic woven bodice back',nameAr:'خلف صدّار منسوج أساسي',pointLoop:['backNeck','backShoulder','backArmhole','backUnderarm','backSideWaist','backFoldWaist'],grain:['backGrainTop','backGrainBottom']}, {op:'setPieceRole',piece:'back',role:'bodice-back',cutOnFold:true,quantity:1}, {op:'setPieceConstruction',piece:'back',notchPoints:['backUnderarm'],edges:[{from:'backUnderarm',to:'backSideWaist',seamId:'bodice-side'}]},
  ]};
}

export function createWovenBasicDressProgram(length) {
  const skirtLength=({short:45,regular:60,long:85})[length]; if(!skirtLength) fail('programInvalid');
  const panel=(id,role,name,nameAr,prefix,y,top,bottom,sideSeam)=>[
    {op:'placePoint',name:`${prefix}Neck`,x:'0',y:String(y)}, {op:'placePoint',name:`${prefix}Shoulder`,x:'3',y:String(y)}, {op:'placePoint',name:`${prefix}Armhole`,x:'chestQuarter-3',y:String(y)}, {op:'placePoint',name:`${prefix}Underarm`,x:'chestQuarter',y:String(y+12)}, {op:'placePoint',name:`${prefix}SideWaist`,x:'waistQuarter',y:String(y+42)}, {op:'placePoint',name:`${prefix}FoldWaist`,x:'0',y:String(y+42)}, {op:'placePoint',name:`${prefix}GrainTop`,x:'waistQuarter/2',y:String(y+12)}, {op:'placePoint',name:`${prefix}GrainBottom`,x:'waistQuarter/2',y:String(y+37)},
    {op:'promotePiece',id,name,nameAr,pointLoop:[`${prefix}Neck`,`${prefix}Shoulder`,`${prefix}Armhole`,`${prefix}Underarm`,`${prefix}SideWaist`,`${prefix}FoldWaist`],grain:[`${prefix}GrainTop`,`${prefix}GrainBottom`]}, {op:'setPieceRole',piece:id,role,cutOnFold:true,quantity:1}, {op:'setPieceConstruction',piece:id,notchPoints:[`${prefix}Underarm`],edges:[{from:`${prefix}Underarm`,to:`${prefix}SideWaist`,seamId:sideSeam}]},
  ];
  const skirt=(id,role,name,nameAr,prefix,y,sideSeam)=>[
    {op:'placePoint',name:`${prefix}FoldWaist`,x:'0',y:String(y)}, {op:'placePoint',name:`${prefix}SideWaist`,x:'waistQuarter',y:String(y)}, {op:'placePoint',name:`${prefix}SideNotch`,x:'waistQuarter+(hemQuarter-waistQuarter)/2',y:`${y}+skirtLength/2`}, {op:'placePoint',name:`${prefix}SideHem`,x:'hemQuarter',y:`${y}+skirtLength`}, {op:'placePoint',name:`${prefix}FoldHem`,x:'0',y:`${y}+skirtLength`}, {op:'placePoint',name:`${prefix}GrainTop`,x:'waistQuarter/2',y:`${y}+5`}, {op:'placePoint',name:`${prefix}GrainBottom`,x:'waistQuarter/2',y:`${y}+skirtLength-5`},
    {op:'promotePiece',id,name,nameAr,pointLoop:[`${prefix}FoldWaist`,`${prefix}SideWaist`,`${prefix}SideNotch`,`${prefix}SideHem`,`${prefix}FoldHem`],grain:[`${prefix}GrainTop`,`${prefix}GrainBottom`]}, {op:'setPieceRole',piece:id,role,cutOnFold:true,quantity:1}, {op:'setPieceConstruction',piece:id,notchPoints:[`${prefix}SideNotch`],edges:[{from:`${prefix}SideWaist`,to:`${prefix}SideHem`,seamId:sideSeam}]},
  ];
  return {version:1,family:'woven-basic-dress',operations:[
    {op:'defineVariable',name:'chestQuarter',formula:'chest/4+2'}, {op:'defineVariable',name:'waistQuarter',formula:'waist/4+2'}, {op:'defineVariable',name:'hemQuarter',formula:'hips/4+10'}, {op:'defineVariable',name:'skirtLength',formula:String(skirtLength)},
    ...panel('bodiceFront','bodice-front','Basic woven dress bodice front','أمام صدّار فستان منسوج أساسي','bf',0,0,0,'dress-bodice-side'), ...panel('bodiceBack','bodice-back','Basic woven dress bodice back','خلف صدّار فستان منسوج أساسي','bb',55,0,0,'dress-bodice-side'),
    ...skirt('skirtFront','skirt-front','Basic woven dress skirt front','أمام تنورة فستان منسوج أساسي','sf',110,'dress-skirt-side'), ...skirt('skirtBack','skirt-back','Basic woven dress skirt back','خلف تنورة فستان منسوج أساسي','sb',110+skirtLength+15,'dress-skirt-side'),
  ]};
}
