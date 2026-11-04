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

export { SHEEP_AVATARS, sheepAvatarUrl, sheepLookOf } from '../lib/sheepAvatars';
export type { SheepLook } from '../lib/sheepAvatars';

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
      {accessory === 'scarf' ? (
        <G fill={accent} stroke={INK} strokeWidth={sw} strokeLinejoin="round">
          <Path d="M30 78 Q50 88 70 78 L71 86 Q50 96 29 86 Z" />
          <Path d="M58 86 L64 100 L54 100 L52 88 Z" />
        </G>
      ) : null}

      {/* Ears, then the face. */}
      <G fill={face} stroke={INK} strokeWidth={sw}>
        <Ellipse cx={29} cy={50} rx={10} ry={5.5} transform="rotate(-20 29 50)" />
        <Ellipse cx={71} cy={50} rx={10} ry={5.5} transform="rotate(20 71 50)" />
        <Ellipse cx={50} cy={57} rx={16} ry={20} />
      </G>
      {accessory === 'headphones' ? (
        <G stroke={INK} strokeWidth={sw}>
          <Path d="M28 52 Q28 18 50 18 Q72 18 72 52" fill="none" stroke={accent} strokeWidth={5} />
          <Rect x={21} y={46} width={11} height={16} rx={5} fill={accent} />
          <Rect x={68} y={46} width={11} height={16} rx={5} fill={accent} />
        </G>
      ) : null}

      {/* The tuft of wool on top of the head. */}
      {accessory !== 'beanie' && accessory !== 'partyHat' ? (
        <G fill={wool} stroke={INK} strokeWidth={sw}>
          <Circle cx={39} cy={39} r={9} />
          <Circle cx={61} cy={39} r={9} />
          <Circle cx={50} cy={34} r={11} />
        </G>
      ) : null}

      {/* Eyes, a nose, a little smile, cheeks. */}
      <Circle cx={43} cy={57} r={2.8} fill={eye} />
      <Circle cx={57} cy={57} r={2.8} fill={eye} />
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
      {accessory === 'sunglasses' ? (
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
