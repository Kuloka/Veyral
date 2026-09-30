const canvas = document.getElementById('hero-globe');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const primaryDownload = document.getElementById('primary-download');
const downloadOptions = document.getElementById('download-options');

if (primaryDownload && downloadOptions) {
  primaryDownload.addEventListener('click', event => {
    event.preventDefault();
    downloadOptions.scrollIntoView({ behavior: reduceMotion.matches ? 'instant' : 'smooth', block: 'center' });
    history.replaceState(null, '', '#download-options');
  });
}

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
