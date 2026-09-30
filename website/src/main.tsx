import * as React from 'react';
import { createRoot } from 'react-dom/client';
import Vortex from '@/components/ui/vortex';
import './global.css';

function Background() {
  const [compact, setCompact] = React.useState(() => window.matchMedia('(max-width: 700px)').matches);
  const [reducedMotion, setReducedMotion] = React.useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  React.useEffect(() => {
    const width = window.matchMedia('(max-width: 700px)');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onWidth = () => setCompact(width.matches);
    const onMotion = () => setReducedMotion(motion.matches);
    width.addEventListener('change', onWidth);
    motion.addEventListener('change', onMotion);
    return () => {
      width.removeEventListener('change', onWidth);
      motion.removeEventListener('change', onMotion);
    };
  }, []);

  return <Vortex className="vortex-canvas" count={compact ? 850 : 2200} speed={reducedMotion ? 0 : 0.7} arms={3} theme="dark" />;
}

const mount = document.getElementById('vortex-root');
if (mount) createRoot(mount).render(<Background />);
