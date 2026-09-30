import * as React from 'react';
import { Canvas } from '@react-three/fiber';
import type { ThemeMode } from './use-shadcn-theme';

export type SceneContainerProps = {
  children: React.ReactNode;
  className?: string;
  theme?: ThemeMode;
  environment?: 'night' | 'dawn' | 'neutral';
  camera?: [number, number, number];
  fov?: number;
};

export function SceneContainer({ children, className, theme = 'auto', environment = 'night', camera = [0, 3, 8], fov = 45 }: SceneContainerProps) {
  return (
    <div className={className} data-theme={theme} data-environment={environment}>
      <Canvas camera={{ position: camera, fov }} dpr={[1, 1.6]} gl={{ alpha: true, antialias: false, powerPreference: 'low-power' }} style={{ width: '100%', height: '100%', background: 'transparent' }}>
        {children}
      </Canvas>
    </div>
  );
}
