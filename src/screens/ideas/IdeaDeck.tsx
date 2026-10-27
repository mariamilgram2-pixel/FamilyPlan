// Ideas as a deck of cards you swipe through. The front card is the idea's
// cover (a blurred photo with the title set over it, like the group cards);
// the next two peek out behind it. Swipe left for the next idea, right for
// the one before; it wraps around. "+N" in the corner says how many others
// are in the deck. Tapping a card opens the idea.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, View } from 'react-native';
import Cover, { useCoverInk } from '../../components/Cover';
import { groupLook } from '../../components/GroupAvatar';
import AvatarStack from '../../components/AvatarStack';
import { AvatarPerson } from '../../components/Avatar';
import { Icon, Tappable, Txt } from '../../components/ui';
import { ideaPhoto } from '../../lib/ideaPhotos';
import { Idea } from '../../types';
import { continuous, radius, space, tabularNums, useTheme, brand } from '../../theme';

const native = Platform.OS !== 'web';
const CARD_HEIGHT = 264;
const PEEK = 16;            // how far each card behind shows below the one in front
const BEHIND = 2;           // cards drawn behind the front one
const SWIPE = 90;           // drag past this (or flick) to move on

export function IdeaDeck({ ideas, index, onIndex, onOpen, onVote, voted, votersOf }: {
  ideas: Idea[];
  index: number;
  onIndex: (i: number) => void;
  onOpen: (idea: Idea) => void;
  onVote: (idea: Idea) => void;
  voted: (idea: Idea) => boolean;
  votersOf: (idea: Idea) => AvatarPerson[];
}) {
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const n = ideas.length;
  const at = (k: number) => ideas[((index + k) % n + n) % n];

  // Latest values for the gesture handlers, which are created once.
  const live = useRef({ index, n, width, onIndex });
  live.current = { index, n, width, onIndex };

  function go(step: 1 | -1) {
    const { index: i, n: count, width: w, onIndex: setIndex } = live.current;
    if (count < 2) { Animated.spring(x, { toValue: 0, useNativeDriver: native }).start(); return; }
    Animated.timing(x, { toValue: -step * (w || 360) * 1.15, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: native })
      .start(() => { x.setValue(0); setIndex(((i + step) % count + count) % count); });
  }

  const pan = useRef(PanResponder.create({
    // Only claim clearly sideways drags, so taps and vertical scrolling still
    // work. Claimed in the capture phase, ahead of the card's own tap handling.
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => x.setValue(g.dx),
    onPanResponderRelease: (_, g) => {
      if (g.dx < -SWIPE || g.vx < -0.5) go(1);
      else if (g.dx > SWIPE || g.vx > 0.5) go(-1);
      else Animated.spring(x, { toValue: 0, friction: 6, useNativeDriver: native }).start();
    },
    onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: native }).start(),
  })).current;

  // A new list (filter, vote) can leave the index past the end.
  useEffect(() => { if (index >= n && n) onIndex(0); }, [n]);

  if (!n) return null;
  const rotate = x.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-7deg', '0deg', '7deg'] });
  const behind = Math.min(BEHIND, n - 1);

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Ideas, ${index + 1} of ${n}: ${at(0).title}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') go(1);
        else if (e.nativeEvent.actionName === 'decrement') go(-1);
        else onOpen(at(0));
      }}
      style={{ height: CARD_HEIGHT + behind * PEEK }}
    >
      {/* Back to front, so the front card draws last. */}
      {Array.from({ length: behind }, (_, k) => behind - k).map(depth => (
        <View
          key={`behind-${depth}`}
          pointerEvents="none"
          style={{
            position: 'absolute', left: 0, right: 0, top: 0, height: CARD_HEIGHT,
            transform: [{ translateY: depth * PEEK }, { scale: 1 - depth * 0.05 }],
            opacity: 1 - depth * 0.18,
          }}
        >
          <IdeaCard idea={at(depth)} quiet />
        </View>
      ))}
      <Animated.View
        {...pan.panHandlers}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: CARD_HEIGHT, transform: [{ translateX: x }, { rotate }] }}
      >
        <IdeaCard
          idea={at(0)}
          more={n - 1}
          voted={voted(at(0))}
          voters={votersOf(at(0))}
          onOpen={() => onOpen(at(0))}
          onVote={() => onVote(at(0))}
        />
      </Animated.View>
    </View>
  );
}

/** One idea as a cover card. `quiet` cards sit behind and show only their cover and title. */
function IdeaCard({ idea, more = 0, voted, voters = [], quiet, onOpen, onVote }: {
  idea: Idea; more?: number; voted?: boolean; voters?: AvatarPerson[]; quiet?: boolean;
  onOpen?: () => void; onVote?: () => void;
}) {
  const { c } = useTheme();
  const photo = ideaPhoto(idea);
  const wash = groupLook({ id: idea.id, name: idea.title }).color;
  const { ink, soft } = useCoverInk(photo, wash);
  const by = idea.profiles?.full_name?.split(' ')[0];
  const inLine = idea.votes ? `${idea.votes} ${idea.votes === 1 ? 'person' : 'people'} in` : 'No one’s in yet';
  const glass = photo ? brand.coverGlass : c.background;

  const body = (
    <Cover photo={photo} wash={wash} blur={3} style={{ flex: 1, padding: space.l - 4, justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 }}>
        {!quiet ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, height: 28, paddingHorizontal: space.s + 2, borderRadius: radius.pill, backgroundColor: glass }}>
            {voters.length ? <AvatarStack people={voters} max={3} size={18} ringColor="transparent" /> : null}
            <Txt v="caption" style={{ color: ink }}>{inLine}</Txt>
          </View>
        ) : <View />}
        {/* How many more ideas are in the deck. */}
        {more > 0 ? (
          <View
            accessibilityLabel={`${more} more idea${more === 1 ? '' : 's'}`}
            style={{ minWidth: 34, height: 28, paddingHorizontal: space.s, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.coverChip }}
          >
            <Txt v="footnote" semibold style={[tabularNums, { color: brand.olive }]}>{`+${more}`}</Txt>
          </View>
        ) : null}
      </View>

      <View style={{ gap: space.hair + 2 }}>
        <Txt v="display" numberOfLines={2} style={{ color: ink, fontSize: 30, lineHeight: 35 }}>{idea.title}</Txt>
        {!quiet && idea.description ? <Txt v="callout" numberOfLines={2} style={{ color: soft }}>{idea.description}</Txt> : null}
        {!quiet ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.s }}>
            <Txt v="footnote" style={{ color: soft }}>{by ? `by ${by}` : ''}</Txt>
            <Tappable
              feedback="opacity"
              onPress={onVote}
              accessibilityLabel={voted ? `You're in. Tap to leave` : `I'm in`}
              accessibilityState={{ selected: !!voted }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: space.hair,
                height: 36, paddingHorizontal: space.m, borderRadius: radius.pill, ...continuous,
                backgroundColor: voted ? c.tint : brand.coverChip,
              }}
            >
              {voted ? <Icon name="checkmark" size={16} color={c.onTint} /> : null}
              <Txt v="callout" semibold style={{ color: voted ? c.onTint : brand.olive }}>{voted ? 'In' : 'I’m in'}</Txt>
            </Tappable>
          </View>
        ) : null}
      </View>
    </Cover>
  );

  if (quiet || !onOpen) return body;
  return (
    <Tappable feedback="none" onPress={onOpen} accessibilityLabel={`${idea.title}. Open`} style={{ flex: 1, borderRadius: radius.group, ...continuous }}>
      {body}
    </Tappable>
  );
}
