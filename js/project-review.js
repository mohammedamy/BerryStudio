import { previewCommands } from './project-revisions.js';

const node = (tag, text) => { const element = document.createElement(tag); if (text != null) element.textContent = text; return element; };

export function patternPreview(pieces, compare = false) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  let cursor = 0;
  const outlines = pieces.map(piece => {
    if (compare) return piece.outline;
    const minX = Math.min(...piece.outline.map(p => p[0])), minY = Math.min(...piece.outline.map(p => p[1]));
    const outline = piece.outline.map(([x,y]) => [x-minX+cursor,y-minY]);
    cursor = Math.max(...outline.map(p => p[0])) + 10;
    return outline;
  });
  const bounds = outlines.flat().reduce((b,[x,y])=>({minX:Math.min(b.minX,x),minY:Math.min(b.minY,y),maxX:Math.max(b.maxX,x),maxY:Math.max(b.maxY,y)}),{minX:0,minY:0,maxX:1,maxY:1});
  svg.setAttribute('viewBox', `${bounds.minX - 5} ${bounds.minY - 5} ${bounds.maxX - bounds.minX + 10} ${bounds.maxY - bounds.minY + 10}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'width:100%;height:220px;background:var(--bg);';
  for (const [index, piece] of pieces.entries()) {
    const path = document.createElementNS(ns, 'polygon');
    path.setAttribute('points', outlines[index].map(p => p.join(',')).join(' '));
    path.setAttribute('fill', /^#[0-9a-f]{6}$/i.test(piece.color) ? piece.color : '#6d5efc');
    path.setAttribute('fill-opacity', '.2'); path.setAttribute('stroke', 'currentColor');
    if (compare && index === 0) { path.setAttribute('stroke-dasharray','2 1'); path.setAttribute('fill','none'); }
    path.setAttribute('stroke-width', '.5'); svg.append(path);
  }
  return svg;
}

// Review is deliberately non-mutating. Closing or rejecting discards the proposal.
export function mountCommandReview(body, project, { t, accept, close }) {
  const form = node('form'); form.className = 'project-review-form';
  const field = (text, input) => { const label = node('label', text); label.style.display = 'block'; input.className = 'input'; input.setAttribute('aria-label', text); label.append(input); form.append(label); return input; };
  const piece = field(t('reviewPiece'), node('select'));
  for (const p of project.pieces) {
    const option = node('option', typeof p.name === 'string' ? p.name : p.name?.[t('dir') === 'rtl' ? 'ar' : 'en'] || p.clothLabId);
    option.value = p.clothLabId; piece.append(option);
  }
  const type = field(t('reviewAction'), node('select'));
  for (const key of ['translate', 'rename', 'color']) { const option = node('option', t(`review_${key}`)); option.value = key; type.append(option); }
  const dx = field(t('reviewDx'), node('input')); dx.type = 'number'; dx.value = '0'; dx.min = '-1000'; dx.max = '1000'; dx.step = 'any';
  const dy = field(t('reviewDy'), node('input')); dy.type = 'number'; dy.value = '0'; dy.min = '-1000'; dy.max = '1000'; dy.step = 'any';
  const name = field(t('reviewName'), node('input')); name.maxLength = 120;
  const color = field(t('reviewColor'), node('input')); color.type = 'color'; color.value = '#6d5efc';
  const toggle = () => { dx.parentElement.hidden = dy.parentElement.hidden = type.value !== 'translate'; name.parentElement.hidden = type.value !== 'rename'; color.parentElement.hidden = type.value !== 'color'; };
  // Inline display must not override the hidden attribute.
  for (const input of [dx, dy, name, color]) input.parentElement.style.removeProperty('display');
  type.onchange = toggle; toggle();
  const preview = node('button', t('reviewPreview')); preview.type = 'submit'; preview.className = 'big-btn'; form.append(preview);
  const result = node('div'); result.setAttribute('aria-live', 'polite');
  const error = node('p'); error.setAttribute('role', 'alert');
  body.append(node('p', t('reviewHint')), form, result, error);
  form.oninput = () => { result.replaceChildren(); error.textContent = ''; };
  form.onsubmit = event => {
    event.preventDefault(); result.replaceChildren(); error.textContent = '';
    try {
      const command = { type: type.value, pieceId: piece.value };
      if (type.value === 'translate') { command.dx = Number(dx.value); command.dy = Number(dy.value); }
      else if (type.value === 'rename') command.name = name.value;
      else command.color = color.value;
      const proposal = previewCommands(project, [command]);
      const before = proposal.before.pieces.find(p => p.clothLabId === piece.value);
      const after = proposal.after.pieces.find(p => p.clothLabId === piece.value);
      result.append(node('p', t('reviewOverlay')), patternPreview([before, after], true));
      const summary = type.value === 'translate' ? `${command.dx}, ${command.dy} cm` : type.value === 'rename' ? `${before.name?.[t('dir') === 'rtl' ? 'ar' : 'en'] || ''} → ${command.name}` : `${before.color || ''} → ${command.color}`;
      result.append(node('p', `${t(`review_${type.value}`)}: ${summary}`));
      const yes = node('button', t('reviewAccept')); yes.className = 'big-btn';
      const no = node('button', t('reviewReject')); no.className = 'big-btn ghost';
      yes.onclick = () => { try { accept(proposal); close(); } catch (e) { error.textContent = t(e.message); yes.disabled = true; } };
      no.onclick = close; const actions=node('div'); actions.className='project-review-actions'; actions.append(yes,no); result.append(actions);
    } catch (e) { error.textContent = t(e.message); }
  };
}
