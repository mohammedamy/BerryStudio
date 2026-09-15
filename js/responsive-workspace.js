/* Non-modal disclosures for narrow workspaces. Desktop panels stay visible. */
export function initResponsiveWorkspace() {
  const media = window.matchMedia('(max-width: 1100px)');
  const rail = document.getElementById('rightRail');
  const actions = document.getElementById('headerActions');
  const railButton = document.getElementById('mobileRailBtn');
  const menuButton = document.getElementById('mobileMenuBtn');
  const closeButton = document.getElementById('closeRailBtn');
  let railOpen = false;
  let menuOpen = false;

  function render() {
    rail.hidden = media.matches && !railOpen;
    actions.hidden = media.matches && !menuOpen;
    railButton.setAttribute('aria-expanded', String(media.matches && railOpen));
    menuButton.setAttribute('aria-expanded', String(media.matches && menuOpen));
  }
  function closeRail(restoreFocus = false) {
    railOpen = false;
    if (restoreFocus) railButton.focus();
    render();
  }
  function closeMenu(restoreFocus = false) {
    menuOpen = false;
    if (restoreFocus) menuButton.focus();
    render();
  }
  railButton.addEventListener('click', () => {
    railOpen = !railOpen;
    menuOpen = false;
    render();
    if (railOpen) closeButton.focus();
  });
  closeButton.addEventListener('click', () => closeRail(true));
  menuButton.addEventListener('click', () => {
    menuOpen = !menuOpen;
    railOpen = false;
    render();
    if (menuOpen) actions.querySelector('button, a')?.focus();
  });
  document.addEventListener('keydown', event => {
    if (!media.matches || event.key !== 'Escape' || document.querySelector('.overlay.show')) return;
    if (menuOpen) { closeMenu(true); event.preventDefault(); }
    else if (railOpen) { closeRail(true); event.preventDefault(); }
  }, true);
  document.addEventListener('pointerdown', event => {
    if (!media.matches || document.querySelector('.overlay.show')) return;
    if (menuOpen && !actions.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
    if (railOpen && !rail.contains(event.target) && !railButton.contains(event.target)) closeRail();
  });
  media.addEventListener('change', () => {
    const focused = document.activeElement;
    railOpen = menuOpen = false;
    if (media.matches && rail.contains(focused)) railButton.focus();
    else if (media.matches && actions.contains(focused)) menuButton.focus();
    else if (!media.matches && [railButton, menuButton, closeButton].includes(focused)) document.getElementById('projectBtn').focus();
    render();
  });
  render();
}
