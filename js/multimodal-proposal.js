// P7-09's bounded reconciliation layer. A reference image can supply
// appearance context, but never hidden construction, body size, scale or fit.
import { prepareBriefDraft } from './design-brief.js';
import { validateImageStudio } from './image-studio.js';

const copy = value => JSON.parse(JSON.stringify(value));
const unresolvedReferenceIssues = [
  'referenceAppearanceOnly',
  'referenceConstructionUnresolved',
  'referenceScaleUnresolved',
  'referenceBackViewUnresolved',
];
const record = value => value && typeof value === 'object' && !Array.isArray(value);

export function validateMultimodalProposal(value) {
  if (!record(value) || !['propose', 'clarify', 'abstain'].includes(value.decision) || !record(value.fields) || !Array.isArray(value.issues) || value.issues.length > 12) throw new Error('multimodalProposalInvalid');
  for (const [field, detail] of Object.entries(value.fields)) {
    if (!/^[a-z]+$/u.test(field) || !record(detail) || typeof detail.source !== 'string' || !['user', 'current-size'].includes(detail.source) || (detail.unit != null && detail.unit !== 'cm')) throw new Error('multimodalProposalInvalid');
  }
  for (const issue of value.issues) if (!record(issue) || typeof issue.field !== 'string' || typeof issue.code !== 'string') throw new Error('multimodalProposalInvalid');
  if (value.reference != null) {
    const reference = value.reference;
    if (!record(reference) || typeof reference.id !== 'string' || !reference.id || !['selected-concept', 'source-image'].includes(reference.kind) || typeof reference.mode !== 'string' || reference.source !== 'user-selected-image' || !['confirmed-by-user', 'not-applicable'].includes(reference.rights)) throw new Error('multimodalProposalInvalid');
    if (reference.prompt != null && (typeof reference.prompt !== 'string' || reference.prompt.length > 1200)) throw new Error('multimodalProposalInvalid');
  }
  return true;
}

function selectedReference(studio) {
  if (!studio) return null;
  validateImageStudio(studio);
  const concept = studio.concepts.find(item => item.id === studio.selectedId);
  if (concept) return {
    id: concept.id, kind: 'selected-concept', mode: concept.mode,
    prompt: concept.prompt, source: 'user-selected-image',
    rights: concept.referenceIds.length ? 'confirmed-by-user' : 'not-applicable',
  };
  if (studio.source) return {
    id: studio.source.id, kind: 'source-image', mode: 'reference-only',
    source: 'user-selected-image', rights: studio.source.rights,
  };
  return null;
}

// Return a serializable proposal for a controlled drafting path. `propose`
// only means the text brief is complete enough for an already-supported block;
// it is never a claim that pixels proved construction or fit.
export function prepareMultimodalProposal({ brief, measurements, studio = null, category = null }) {
  let reference;
  try { reference = selectedReference(studio); }
  catch { return { decision: 'abstain', issues: [{ field: 'reference', code: 'invalidReference' }] }; }
  if (!brief) return {
    decision: 'clarify', reference, fields: {},
    issues: [{ field: 'brief', code: 'briefRequiredForImage' }, ...(reference ? unresolvedReferenceIssues.map(code => ({ field: 'reference', code })) : [])],
  };
  const prepared = prepareBriefDraft(brief, measurements);
  const fields = Object.fromEntries(Object.entries(brief.fields).map(([key, field]) => [key, {
    value: field.value, unit: field.unit || null, source: field.source,
  }]));
  if (category) fields.category = { value: category, unit: null, source: 'user' };
  const issues = copy(prepared.issues);
  if (reference) issues.push(...unresolvedReferenceIssues.map(code => ({ field: 'reference', code })));
  const proposal = {
    decision: prepared.decision,
    prompt: prepared.prompt || null,
    measurements: prepared.measurements ? copy(prepared.measurements) : null,
    provenance: prepared.provenance ? copy(prepared.provenance) : null,
    fields, reference, issues,
  };
  validateMultimodalProposal(proposal);
  return proposal;
}
