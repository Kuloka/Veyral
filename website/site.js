const canvas = document.getElementById('hero-globe');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

if (canvas && window.VeyralGlobe) {
  const globe = new window.VeyralGlobe(canvas, () => {}, () => {});
  const cities = [
    ['Frankfurt', 8.6821, 50.1109],
    ['Istanbul', 28.9784, 41.0082],
    ['New York', -74.0060, 40.7128],
    ['Tokyo', 139.6917, 35.6895],
    ['São Paulo', -46.6333, -23.5505],
    ['Singapore', 103.8198, 1.3521],
  ];
  globe.setPoints(cities.map(([city, longitude, latitude], index) => ({
    item: { city, longitude, latitude, type: 'illustration', address: city },
    quality: ['fast', 'medium', 'fast', 'medium', 'fast', 'medium'][index],
  })));
  if (reduceMotion.matches) globe.idle = false;
  reduceMotion.addEventListener('change', event => { globe.idle = !event.matches; });
}

const primaryDownload = document.getElementById('primary-download');
if (primaryDownload) {
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const agent = navigator.userAgent || '';
  const base = 'https://github.com/Kuloka/Veyral/releases/download/v1.0/';
  const isAppleSilicon = /Mac/.test(platform) && /arm|aarch64/i.test(agent);
  if (/Win/i.test(platform)) primaryDownload.href = base + 'Veyral-1.0.0-win-x64.exe';
  else if (/Mac/i.test(platform)) primaryDownload.href = base + (isAppleSilicon ? 'Veyral-1.0.0-mac-arm64.dmg' : 'Veyral-1.0.0-mac-x64.dmg');
  else if (/Linux/i.test(platform)) primaryDownload.href = base + 'Veyral-1.0.0-linux-x86_64.AppImage';
}

if ('IntersectionObserver' in window && !reduceMotion.matches) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }
  }, { threshold: 0.12 });
  document.querySelectorAll('.steps article, .download-row').forEach(element => {
    element.classList.add('reveal'); observer.observe(element);
  });
}
