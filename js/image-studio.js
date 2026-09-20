const clone = value => JSON.parse(JSON.stringify(value));
const validDataURL = value => typeof value === 'string' && /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(value) && value.length <= 2_800_000;
const validText = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 1_200;

export function emptyImageStudio() { return { version: 1, source: null, concepts: [], selectedId: null }; }

export function validateImageStudio(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.concepts) || value.concepts.length > 6) throw new Error('imageStudioInvalid');
  if (value.source && (typeof value.source.id !== 'string' || !value.source.id || !validDataURL(value.source.image) || value.source.rights !== 'confirmed-by-user')) throw new Error('imageStudioInvalid');
  for (const item of value.concepts) {
    if (!item || typeof item.id !== 'string' || !validText(item.prompt) || typeof item.providerId !== 'string' || !validDataURL(item.image) ||
      !['text-to-image','image-to-image'].includes(item.mode) || !Array.isArray(item.referenceIds) || item.referenceIds.length !== (item.mode === 'image-to-image' ? 1 : 0) || !item.referenceIds.every(id => typeof id === 'string' && id)) throw new Error('imageStudioInvalid');
  }
  if (new Set(value.concepts.map(item => item.id)).size !== value.concepts.length) throw new Error('imageStudioInvalid');
  if (value.selectedId != null && !value.concepts.some(item => item.id === value.selectedId)) throw new Error('imageStudioInvalid');
  return true;
}

export function setStudioSource(previous, image, rightsConfirmed) {
  const studio = previous ? clone(previous) : emptyImageStudio(); validateImageStudio(studio);
  if (!rightsConfirmed) throw new Error('imageStudioRights');
  if (!validDataURL(image)) throw new Error('imageStudioInvalid');
  studio.source = { id: crypto.randomUUID(), image, rights: 'confirmed-by-user' };
  return studio;
}

export function appendStudioConcept(previous, { prompt, providerId, image, mode }) {
  const studio = previous ? clone(previous) : emptyImageStudio(); validateImageStudio(studio);
  if (!validText(prompt) || typeof providerId !== 'string' || !validDataURL(image)) throw new Error('imageStudioInvalid');
  if (mode === 'image-to-image' && !studio.source) throw new Error('imageStudioSourceNeeded');
  if (!['text-to-image','image-to-image'].includes(mode)) throw new Error('imageStudioInvalid');
  const concept = { id: crypto.randomUUID(), prompt: prompt.trim(), providerId, image, mode, referenceIds: mode === 'image-to-image' ? [studio.source.id] : [] };
  studio.concepts = [...studio.concepts, concept].slice(-6);
  if (!studio.concepts.some(item => item.id === studio.selectedId)) studio.selectedId = null;
  return studio;
}

export function selectStudioConcept(previous, id) {
  const studio = clone(previous); validateImageStudio(studio);
  if (!studio.concepts.some(item => item.id === id)) throw new Error('imageStudioInvalid');
  studio.selectedId = id; return studio;
}
