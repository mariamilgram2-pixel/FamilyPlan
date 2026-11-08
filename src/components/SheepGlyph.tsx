// A sheep drawn as an icon, in the same line weight as the tab bar's other
// icons: a cloud of wool, a solid head, two legs. Selected, the wool fills in
// lightly, the way the other tabs switch to their filled icons.

import React from 'react';
import Svg, { Ellipse, Line, Path } from 'react-native-svg';

export function SheepGlyph({ size = 20, color, filled }: { size?: number; color: string; filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Line x1={8.5} y1={16} x2={8.5} y2={20} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={14.5} y1={16} x2={14.5} y2={20} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path
        d="M6 16 a2.6 2.6 0 0 1 -0.6 -5 a3 3 0 0 1 4.6 -3.1 a3 3 0 0 1 5 0 a2.8 2.8 0 0 1 3.6 3.4 a2.6 2.6 0 0 1 -1.1 4.7 Z"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
        fillOpacity={filled ? 0.22 : 0}
      />
      <Ellipse cx={19.4} cy={10.6} rx={2.3} ry={2.8} fill={color} />
    </Svg>
  );
}
