// Runs before the stylesheet so the page never flashes the wrong theme.
// Preference: 'light' | 'dark' | unset (follow the operating system).
(() => {
  const KEY = 'awp-theme', root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const saved = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const effective = () => saved() || (media && media.matches ? 'dark' : 'light');
  const apply = () => { root.dataset.theme = effective(); root.style.colorScheme = root.dataset.theme; };
  apply();
  if (media && media.addEventListener) media.addEventListener('change', () => { if (!saved()) apply(); });
  window.Theme = {
    get: effective,
    toggle() { try { localStorage.setItem(KEY, effective() === 'dark' ? 'light' : 'dark'); } catch (e) {} apply(); return effective(); },
  };
})();
