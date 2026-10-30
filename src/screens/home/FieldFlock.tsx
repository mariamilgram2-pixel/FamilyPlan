// Bottom hillside from the shared calendar app (components/field-scene.tsx).
// Sage ground and crest, with the imported drawings standing on the slope.
// The folder has eight drawings; the scene places fourteen by repeating them.

import React, { useState } from 'react';
import { Image, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { TAB_BAR_HEIGHT } from '../../components/ui';
import { useLayout, brand } from '../../theme';

const GROUND = brand.meadow;
const CREST = brand.meadowCrest;

// Pixel sizes of the imported drawings. Web's Image has no resolveAssetSource.
export const ART = {
  lying1: { source: require('../../../assets/sheep/lying-1.png'), w: 82, h: 61 },
  lying2: { source: require('../../../assets/sheep/lying-2.png'), w: 80, h: 60 },
  sitting1: { source: require('../../../assets/sheep/sitting-1.png'), w: 71, h: 51 },
  grazing1: { source: require('../../../assets/sheep/grazing-1.png'), w: 65, h: 50 },
  grazing2: { source: require('../../../assets/sheep/grazing-2.png'), w: 73, h: 67 },
  standing1: { source: require('../../../assets/sheep/standing-1.png'), w: 60, h: 66 },
  standing2: { source: require('../../../assets/sheep/standing-2.png'), w: 77, h: 86 },
  standing3: { source: require('../../../assets/sheep/standing-3.png'), w: 83, h: 86 },
} as const;

type Art = (typeof ART)[keyof typeof ART];

const FLOCK: { art: Art; left: `${number}%`; bottom: number; height: number }[] = [
  { art: ART.lying1, left: '1%', bottom: 4, height: 42 },
  { art: ART.standing2, left: '8%', bottom: 10, height: 70 },
  { art: ART.grazing1, left: '16%', bottom: 2, height: 48 },
  { art: ART.sitting1, left: '23%', bottom: 16, height: 40 },
  { art: ART.standing3, left: '30%', bottom: 6, height: 64 },
  { art: ART.lying2, left: '38%', bottom: 2, height: 38 },
  { art: ART.grazing2, left: '45%', bottom: 12, height: 56 },
  { art: ART.standing1, left: '53%', bottom: 4, height: 62 },
  { art: ART.sitting1, left: '60%', bottom: 18, height: 36 },
  { art: ART.lying1, left: '66%', bottom: 2, height: 44 },
  { art: ART.standing2, left: '73%', bottom: 8, height: 68 },
  { art: ART.grazing1, left: '81%', bottom: 4, height: 46 },
  { art: ART.standing3, left: '87%', bottom: 14, height: 58 },
  { art: ART.lying2, left: '94%', bottom: 2, height: 36 },
];

export function useFieldFlockInset() {
  const { compact } = useLayout();
  const insets = useSafeAreaInsets();
  const artHeight = compact ? 144 : 176;
  // The ground continues under the tab bar; the bar paints on top of it.
  const behind = compact ? TAB_BAR_HEIGHT + insets.bottom : 0;
  return { artHeight, behind, height: artHeight + behind };
}

function SheepArt({ art, left, bottom, height }: { art: Art; left: `${number}%`; bottom: number; height: number }) {
  const width = (art.w / art.h) * height;
  return (
    <Image
      source={art.source}
      accessibilityIgnoresInvertColors
      style={{ position: 'absolute', left, bottom, width, height }}
    />
  );
}

/** Hills at the end of the home page. The ground runs under the tab bar. */
export function FieldFlock() {
  const { artHeight, behind, height } = useFieldFlockInset();
  const [width, setWidth] = useState(0);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ width: '100%', height, overflow: 'hidden' }}
    >
      {behind > 0 ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: behind, backgroundColor: GROUND }} /> : null}
      {width > 0 && (
        <Svg width={width} height={artHeight} viewBox="0 0 1200 160" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, bottom: behind }}>
          <Path d="M0 62C140 62 200 14 340 14c160 0 220 50 420 50 180 0 250-52 440-46V160H0Z" fill={GROUND} />
          <Path
            d="M0 62C140 62 200 14 340 14c160 0 220 50 420 50 180 0 250-52 440-46"
            fill="none"
            stroke={CREST}
            strokeWidth={2.5}
            vectorEffect="nonScalingStroke"
          />
        </Svg>
      )}
      {FLOCK.map((sheep, i) => (
        <SheepArt key={`${sheep.left}-${i}`} art={sheep.art} left={sheep.left} bottom={sheep.bottom + behind} height={sheep.height} />
      ))}
    </View>
  );
}
