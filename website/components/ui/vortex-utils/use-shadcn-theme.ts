import * as React from 'react';
import * as THREE from 'three';

export type ThemeMode = 'auto' | 'light' | 'dark';

export function useShadcnTheme(theme: ThemeMode) {
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setRevision(value => value + 1);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    media.addEventListener('change', update);
    return () => { observer.disconnect(); media.removeEventListener('change', update); };
  }, []);

  return React.useMemo(() => {
    const styles = getComputedStyle(document.documentElement);
    const dark = theme === 'dark' || (theme === 'auto' && (document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches));
    const primary = styles.getPropertyValue('--primary').trim() || (dark ? '#8178ff' : '#4f46e5');
    const muted = styles.getPropertyValue('--muted-foreground').trim() || (dark ? '#656b85' : '#8b90a0');
    return { primaryColor: new THREE.Color(primary), mutedColor: new THREE.Color(muted) };
  }, [theme, revision]);
}
