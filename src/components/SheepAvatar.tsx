// Sheep profile pictures: drawn portraits in the hillside sheep's line style,
// so faces in the app feel friendly instead of like stock photos. Each one is
// a background, a wool, a face, and something it's wearing.
//
// Stored like a photo, in avatar_url, as "sheep:<id>" (e.g. "sheep:clay"), so
// anyone can pick one as their picture; Avatar draws it. The set to choose
// from is SHEEP_AVATARS, in lib/sheepAvatars.

import React from 'react';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import { CREAM, INK, SheepLook } from '../lib/sheepAvatars';

export { SHEEP_AVATARS, SKIN_TONES, sheepAvatarUrl, sheepLookOf } from '../lib/sheepAvatars';
export type { SheepLook } from '../lib/sheepAvatars';

const WHITE_SHIRT = '#FFFFFF';
/** What covers the tuft of wool on top of the head. */
const HATS = new Set(['beanie', 'partyHat', 'strawHat', 'chefHat', 'nightcap', 'ghost']);

/** A sheep portrait filling a square; the caller rounds it. */
export function SheepAvatar({ look, size }: { look: SheepLook; size: number }) {
  const { wool, face, eye, accessory, accent = INK } = look;
  const sw = 2.4;   // line weight, in the 100-unit drawing
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={0} y={0} width={100} height={100} fill={look.bg} />

      {/* Shoulders: a cloud of wool along the bottom. */}
      <G fill={wool} stroke={INK} strokeWidth={sw}>
        <Circle cx={16} cy={100} r={18} />
        <Circle cx={84} cy={100} r={18} />
        <Circle cx={34} cy={94} r={17} />
        <Circle cx={66} cy={94} r={17} />
        <Circle cx={50} cy={92} r={18} />
      </G>
      {accessory === 'ghost' ? (
        // A sheet over the head, face peeking out, hem along the shoulders.
        <G fill="#FAFAFA" stroke={INK} strokeWidth={sw} strokeLinejoin="round">
          <Path d="M22 92 Q18 60 26 42 Q36 16 50 16 Q64 16 74 42 Q82 60 78 92 Q72 86 66 92 Q60 86 54 92 Q48 86 42 92 Q36 86 30 92 Q26 86 22 92 Z" />
        </G>
      ) : null}
      {accessory === 'suit' ? (
        // Jacket, shirt collar, and a tie.
        <G stroke={INK} strokeWidth={sw} strokeLinejoin="round">
          <Path d="M14 100 Q16 80 36 76 L50 100 Z" fill="#2E3A55" />
          <Path d="M86 100 Q84 80 64 76 L50 100 Z" fill="#2E3A55" />
          <Path d="M38 76 L50 90 L62 76 Z" fill={WHITE_SHIRT} />
          <Path d="M47 80 L53 80 L52 84 L55 98 L50 100 L45 98 L48 84 Z" fill={accent} />
          <Circle cx={30} cy={86} r={2} fill="#F2C14E" strokeWidth={1.2} />
        </G>
      ) : null}
      {accessory === 'doctor' ? (
        // A stethoscope around the neck.
        <G fill="none" stroke={accent} strokeWidth={2.6} strokeLinecap="round">
          <Path d="M34 76 Q34 92 46 94" />
          <Path d="M66 76 Q66 92 54 94" />
          <Path d="M54 94 Q60 98 62 90" />
          <Circle cx={62} cy={87} r={3.6} fill="#D8DDE2" stroke={INK} strokeWidth={1.6} />
        </G>
      ) : null}
      {accessory === 'model' ? (
        // Pearls.
        <G fill="#FBF7EE" stroke={INK} strokeWidth={1.2}>
          {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map(i => (
            <Circle key={i} cx={50 + i * 4} cy={79 + (16 - i * i) * 0.3} r={2} />
          ))}
        </G>
      ) : null}
      {accessory === 'comedian' ? (
        // A bow tie, and a microphone.
        <G stroke={INK} strokeWidth={1.8} strokeLinejoin="round">
          <Path d="M50 80 L41 75 L41 85 Z" fill={accent} />
          <Path d="M50 80 L59 75 L59 85 Z" fill={accent} />
          <Circle cx={50} cy={80} r={2.4} fill={accent} />
          <Path d="M66 100 L69 86" stroke={INK} strokeWidth={5} strokeLinecap="round" />
          <Circle cx={70} cy={80} r={6.5} fill="#6B6B6B" />
          <Path d="M65 78 L75 78 M64.5 82 L75.5 82" stroke="#9A9A9A" strokeWidth={1} />
        </G>
      ) : null}
      {accessory === 'gardener' ? (
        // Overall straps, and a potted seedling to hold.
        <G stroke={INK} strokeWidth={1.8} strokeLinejoin="round">
          <Path d="M36 78 L40 100" stroke="#6C8BB0" strokeWidth={4} strokeLinecap="round" />
          <Path d="M64 78 L60 100" stroke="#6C8BB0" strokeWidth={4} strokeLinecap="round" />
          <Path d="M70 74 Q66 66 60 66 Q62 73 70 74 Z" fill={accent} />
          <Path d="M72 74 Q76 64 83 65 Q81 73 72 74 Z" fill={accent} />
          <Line x1={71} y1={84} x2={71} y2={73} stroke={accent} strokeWidth={2.2} />
          <Path d="M62 84 L80 84 L77 100 L65 100 Z" fill="#C7744A" />
          <Rect x={60} y={82} width={22} height={5} rx={1.5} fill="#D88A5E" />
        </G>
      ) : null}
      {accessory === 'scarf' ? (
        <G fill={accent} stroke={INK} strokeWidth={sw} strokeLinejoin="round">
          <Path d="M30 78 Q50 88 70 78 L71 86 Q50 96 29 86 Z" />
          <Path d="M58 86 L64 100 L54 100 L52 88 Z" />
        </G>
      ) : null}

      {/* Ears (under a ghost's sheet, none), then the face. */}
      <G fill={face} stroke={INK} strokeWidth={sw}>
        {accessory !== 'ghost' ? (
          <>
            <Ellipse cx={29} cy={50} rx={10} ry={5.5} transform="rotate(-20 29 50)" />
            <Ellipse cx={71} cy={50} rx={10} ry={5.5} transform="rotate(20 71 50)" />
          </>
        ) : null}
        <Ellipse cx={50} cy={57} rx={16} ry={20} />
      </G>
      {accessory === 'antenna' ? (
        // Bolts where the ears were.
        <G fill="#C9CED6" stroke={INK} strokeWidth={sw}>
          <Rect x={22} y={48} width={10} height={10} rx={2} />
          <Rect x={68} y={48} width={10} height={10} rx={2} />
        </G>
      ) : null}
      {accessory === 'headphones' ? (
        <G stroke={INK} strokeWidth={sw}>
          <Path d="M28 52 Q28 18 50 18 Q72 18 72 52" fill="none" stroke={accent} strokeWidth={5} />
          <Rect x={21} y={46} width={11} height={16} rx={5} fill={accent} />
          <Rect x={68} y={46} width={11} height={16} rx={5} fill={accent} />
        </G>
      ) : null}

      {/* The tuft of wool on top of the head. */}
      {!HATS.has(accessory) ? (
        <G fill={wool} stroke={INK} strokeWidth={sw}>
          <Circle cx={39} cy={39} r={9} />
          <Circle cx={61} cy={39} r={9} />
          <Circle cx={50} cy={34} r={11} />
        </G>
      ) : null}

      {/* Eyes (sleepy ones closed), a nose, a little smile, cheeks. */}
      {accessory === 'nightcap' ? (
        <G fill="none" stroke={eye} strokeWidth={1.8} strokeLinecap="round">
          <Path d="M39.5 57 Q43 59.5 46.5 57" />
          <Path d="M53.5 57 Q57 59.5 60.5 57" />
        </G>
      ) : (
        <>
          <Circle cx={43} cy={57} r={2.8} fill={eye} />
          <Circle cx={57} cy={57} r={2.8} fill={eye} />
        </>
      )}
      <Ellipse cx={50} cy={66} rx={3.2} ry={2.2} fill={eye} opacity={0.85} />
      <Path d="M46 70 Q50 73 54 70" fill="none" stroke={eye} strokeWidth={1.8} strokeLinecap="round" opacity={0.85} />
      <Circle cx={39} cy={64} r={3.4} fill="#E58C8C" opacity={0.35} />
      <Circle cx={61} cy={64} r={3.4} fill="#E58C8C" opacity={0.35} />

      {/* What it's wearing. */}
      {accessory === 'glasses' ? (
        <G fill="none" stroke={INK} strokeWidth={2.2}>
          <Circle cx={43} cy={57} r={6.5} />
          <Circle cx={57} cy={57} r={6.5} />
          <Line x1={49.5} y1={57} x2={50.5} y2={57} />
        </G>
      ) : null}
      {accessory === 'sunglasses' || accessory === 'model' ? (
        <G fill={INK} stroke={INK} strokeWidth={1.5}>
          <Rect x={35} y={52} width={13} height={9} rx={3.5} />
          <Rect x={52} y={52} width={13} height={9} rx={3.5} />
          <Line x1={47} y1={55} x2={53} y2={55} strokeWidth={2} />
        </G>
      ) : null}
      {accessory === 'beanie' ? (
        <G stroke={INK} strokeWidth={sw}>
          <Path d="M32 44 Q32 22 50 22 Q68 22 68 44 Z" fill={accent} />
          <Rect x={30} y={40} width={40} height={8} rx={4} fill={accent} />
          <Circle cx={50} cy={19} r={5} fill={CREAM} />
        </G>
      ) : null}
      {accessory === 'partyHat' ? (
        <G stroke={INK} strokeWidth={sw} strokeLinejoin="round">
          <Path d="M38 42 L50 12 L62 42 Z" fill={accent} />
          <Path d="M43 30 L57 30 M41 36 L59 36" stroke={CREAM} strokeWidth={2.4} />
          <Circle cx={50} cy={11} r={4} fill="#F2C14E" />
          <Ellipse cx={50} cy={42} rx={13} ry={3.5} fill={wool} />
        </G>
      ) : null}
      {accessory === 'beret' ? (
        <G stroke={INK} strokeWidth={sw}>
          <Ellipse cx={46} cy={30} rx={18} ry={7} fill={accent} transform="rotate(-12 46 30)" />
          <Line x1={44} y1={23} x2={45} y2={19} strokeLinecap="round" />
        </G>
      ) : null}
      {accessory === 'flower' ? (
        <G stroke={INK} strokeWidth={1.6}>
          {[0, 72, 144, 216, 288].map(a => (
            <Circle key={a} cx={64 + 5 * Math.cos((a * Math.PI) / 180)} cy={33 + 5 * Math.sin((a * Math.PI) / 180)} r={3.6} fill={accent} />
          ))}
          <Circle cx={64} cy={33} r={2.6} fill="#E07A3F" />
        </G>
      ) : null}
      {accessory === 'strawHat' ? (
        <G stroke={INK} strokeWidth={sw} strokeLinejoin="round">
          <Ellipse cx={50} cy={38} rx={30} ry={7} fill="#E3C16F" />
          <Path d="M36 38 Q36 20 50 20 Q64 20 64 38 Z" fill="#E3C16F" />
          <Path d="M36.5 33 L63.5 33 L64 38 L36 38 Z" fill={accent} strokeWidth={1.6} />
        </G>
      ) : null}
      {accessory === 'chefHat' ? (
        <G fill="#FFFFFF" stroke={INK} strokeWidth={sw} strokeLinejoin="round">
          <Circle cx={38} cy={24} r={9} />
          <Circle cx={62} cy={24} r={9} />
          <Circle cx={50} cy={18} r={11} />
          <Rect x={36} y={24} width={28} height={16} rx={2} />
          <Line x1={44} y1={30} x2={44} y2={38} strokeWidth={1.4} />
          <Line x1={56} y1={30} x2={56} y2={38} strokeWidth={1.4} />
        </G>
      ) : null}
      {accessory === 'nightcap' ? (
        <G stroke={INK} strokeWidth={sw} strokeLinejoin="round">
          <Path d="M32 42 Q30 22 50 20 Q66 20 74 30 Q80 38 82 46 L74 44 Q70 34 66 30 Q68 40 68 42 Z" fill={accent} />
          <Rect x={30} y={38} width={40} height={7} rx={3.5} fill={CREAM} />
          <Circle cx={82} cy={48} r={4.5} fill={CREAM} />
          <Path d="M14 22 L22 22 L14 30 L22 30" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        </G>
      ) : null}
      {accessory === 'antenna' ? (
        <G stroke={INK} strokeWidth={sw}>
          <Line x1={50} y1={24} x2={50} y2={12} />
          <Circle cx={50} cy={10} r={4} fill={accent} />
        </G>
      ) : null}
      {accessory === 'doctor' ? (
        // A head mirror on a band.
        <G stroke={INK} strokeWidth={1.8}>
          <Path d="M31 38 Q50 30 69 38" fill="none" stroke="#5B6B7A" strokeWidth={3} />
          <Circle cx={50} cy={31} r={6} fill="#D8DDE2" />
          <Circle cx={50} cy={31} r={2} fill="#FFFFFF" strokeWidth={0} />
        </G>
      ) : null}
      {accessory === 'gardener' ? (
        // A sprout growing out of the wool.
        <G stroke={INK} strokeWidth={1.6} strokeLinejoin="round">
          <Line x1={50} y1={24} x2={50} y2={15} stroke={accent} strokeWidth={2.2} strokeLinecap="round" />
          <Path d="M50 17 Q44 10 38 12 Q41 19 50 17 Z" fill={accent} />
          <Path d="M50 15 Q56 7 63 9 Q60 17 50 15 Z" fill={accent} />
        </G>
      ) : null}
      {accessory === 'bow' ? (
        <G fill={accent} stroke={INK} strokeWidth={1.8} strokeLinejoin="round">
          <Path d="M62 32 L54 26 L54 38 Z" />
          <Path d="M62 32 L70 26 L70 38 Z" />
          <Circle cx={62} cy={32} r={2.6} />
        </G>
      ) : null}
    </Svg>
  );
}
