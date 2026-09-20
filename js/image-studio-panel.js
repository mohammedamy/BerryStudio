import { appendStudioConcept, emptyImageStudio, selectStudioConcept, setStudioSource, validateImageStudio } from './image-studio.js';

const node = (tag, text) => { const element = document.createElement(tag); if (text != null) element.textContent = text; return element; };

export function mountImageStudio(container, { t, getStudio, saveStudio, provider, generate, projectKey }) {
  const section = node('section'); section.className = 'image-studio'; section.style.cssText = 'display:grid;gap:10px;margin-top:24px';
  section.append(node('h3', t('imageStudioTitle')), node('p', t('imageStudioScope')));
  const capability = node('p'); capability.className = 'help-note';
  const sourcePreview = node('div'); sourcePreview.className = 'ai-preview';
  const rights = node('label'); const permission = node('input'); permission.type = 'checkbox'; rights.append(permission, document.createTextNode(' ' + t('imageStudioRights')));
  const file = node('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.style.display = 'none';
  const upload = node('button', t('imageStudioUpload')); upload.className = 'big-btn ghost'; upload.type = 'button';
  const promptLabel = node('label', t('imageStudioPrompt')); promptLabel.htmlFor = 'imageStudioPrompt';
  const prompt = node('textarea'); prompt.id = 'imageStudioPrompt'; prompt.className = 'textarea'; prompt.maxLength = 1200; prompt.placeholder = t('imageStudioPromptPh');
  const generateButton = node('button', t('imageStudioGenerate')); generateButton.className = 'big-btn'; generateButton.type = 'button';
  const cancel = node('button', t('imageStudioCancel')); cancel.className = 'big-btn ghost'; cancel.type = 'button'; cancel.hidden = true;
  const status = node('p'); status.setAttribute('aria-live', 'polite');
  const gallery = node('div'); gallery.className = 'image-studio-gallery'; gallery.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px';
  let uploaded = null, requestId = 0, busy = false;
  const currentStudio = () => {
    const studio = getStudio() || emptyImageStudio();
    validateImageStudio(studio);
    return studio;
  };
  const imageMode = () => currentStudio().source ? 'image-to-image' : 'text-to-image';
  const adapter = () => provider();
  function paint() {
    let studio;
    try { studio = currentStudio(); }
    catch {
      capability.textContent = t('imageStudioInvalid'); generateButton.disabled = true;
      sourcePreview.replaceChildren(); sourcePreview.classList.remove('show'); gallery.replaceChildren();
      return;
    }
    const current = adapter(); const mode = imageMode();
    const allowed = current && (mode === 'text-to-image' ? current.capabilities.textToImage : current.capabilities.imageToImage);
    capability.textContent = !current ? t('imageStudioProviderMissing') : mode === 'image-to-image' && !allowed ? t('imageStudioEditUnsupported') : `${t('imageStudioMode')}: ${t(mode === 'text-to-image' ? 'imageStudioTextMode' : 'imageStudioEditMode')}`;
    generateButton.disabled = busy || !allowed || !prompt.value.trim();
    prompt.disabled = busy; upload.disabled = busy; permission.disabled = busy;
    sourcePreview.replaceChildren();
    if (studio.source) { const img = node('img'); img.src = studio.source.image; img.alt = t('imageStudioReferenceAlt'); sourcePreview.append(img); }
    sourcePreview.classList.toggle('show', !!studio.source);
    gallery.replaceChildren();
    for (const concept of studio.concepts) {
      const button = node('button'); button.type = 'button'; button.style.cssText = `padding:0;border:2px solid ${studio.selectedId === concept.id ? 'var(--brand)' : 'transparent'};background:transparent`;
      const image = node('img'); image.src = concept.image; image.alt = concept.prompt; image.style.cssText = 'width:100%;aspect-ratio:1;object-fit:cover;display:block';
      button.disabled = busy; button.setAttribute('aria-pressed', String(studio.selectedId === concept.id)); button.append(image); button.onclick = () => { try { saveStudio(selectStudioConcept(studio, concept.id)); paint(); } catch(error) { status.textContent=t(error.message); } };
      gallery.append(button);
    }
  }
  upload.onclick = () => file.click();
  file.onchange = () => {
    const item = file.files?.[0]; if (!item) return;
    const reader = new FileReader(); reader.onload = () => { permission.checked = false; uploaded = reader.result; status.textContent = t('imageStudioSourceReady'); }; reader.readAsDataURL(item);
  };
  permission.onchange = () => {
    if (!uploaded || !permission.checked) return;
    try { saveStudio(setStudioSource(getStudio(), uploaded, true)); uploaded = null; file.value = ''; status.textContent = t('imageStudioSourceSaved'); paint(); }
    catch (error) { status.textContent = t(error.message); permission.checked = false; }
  };
  prompt.oninput = paint;
  cancel.onclick = () => { requestId++; busy = false; status.textContent = t('imageStudioCancelled'); cancel.hidden = true; paint(); };
  generateButton.onclick = async () => {
    let studio;
    try { studio = currentStudio(); }
    catch { status.textContent = t('imageStudioInvalid'); paint(); return; }
    const current = adapter(); const mode = studio.source ? 'image-to-image' : 'text-to-image';
    if (busy || !current || !prompt.value.trim() || !(mode === 'image-to-image' ? current.capabilities.imageToImage : current.capabilities.textToImage)) return;
    const id = ++requestId, key = projectKey(), direction = prompt.value.trim(), base = JSON.stringify(studio);
    const active = () => id === requestId && section.isConnected && key === projectKey();
    busy = true; paint(); generateButton.disabled = true; cancel.hidden = false; status.textContent = t('imageStudioWorking');
    try {
      const image = await generate({ prompt: direction, images: mode === 'image-to-image' ? [studio.source.image] : [], providerId: current.id });
      if (!active() || JSON.stringify(currentStudio()) !== base) return;
      saveStudio(appendStudioConcept(studio, { prompt: direction, providerId: current.id, image, mode }));
      prompt.value = ''; status.textContent = t('imageStudioReady'); paint();
    } catch (error) { if (active()) status.textContent = t(error.message === 'projectStorageFailed' ? 'projectStorageFailed' : 'imageStudioFailed'); }
    finally { if (id === requestId) { busy = false; cancel.hidden = true; if (section.isConnected) paint(); } }
  };
  const remove = node('button', t('removeImg')); remove.type = 'button'; remove.className = 'big-btn ghost';
  remove.onclick = () => { if(busy) return; try { const studio=currentStudio(); studio.source=null; saveStudio(studio); paint(); } catch(error) { status.textContent=t(error.message); } };
  section.append(capability, sourcePreview, remove, rights, file, upload, promptLabel, prompt, generateButton, cancel, status, gallery);
  container.append(section); paint(); return paint;
}
