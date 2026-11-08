// A cover photo for an idea card, picked from what the idea is about.
// Ideas don't carry photos of their own yet, so its words choose one of a
// small set of warm stock photos; anything that matches none gets a color wash.

import { Idea } from '../types';

const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?w=900&q=70&auto=format&fit=crop`;

// First match wins, so the more specific words come first.
const BY_WORD: [RegExp, string][] = [
  [/\b(camp|camping|tent|tents|cabin|cabins|campfire)\b/i, '1487730116645-74489c95b41b'],        // tents glowing in a forest
  [/\b(taco|tacos|burrito|mexican)\b/i, '1565299585323-38d6b0865b47'],                           // tacos
  [/\b(pottery|ceramic|ceramics|clay|wheel|craft|crafts)\b/i, '1493106641515-6b5631de4bb9'],      // hands at a pottery wheel
  [/\b(aquarium|fish|ocean|sea life)\b/i, '1524704654690-b56c05c78a00'],                         // a bright fish
  [/\b(game|games|board|cards|trivia)\b/i, '1610890716171-6b1bb98ffd09'],                        // a board game
  [/\b(road ?trip|drive|driving)\b/i, '1500530855697-b586d89ba3ee'],                             // an open road
  [/\b(hike|hiking|mountain|mountains|trail|ski|skiing|summit)\b/i, '1506905925346-21bda4d32df4'], // mountains at dusk
  [/\b(weekend|getaway|trip|fall|autumn|leaves|foliage|vermont|lake)\b/i, '1507371341162-763b5e419408'], // autumn trees on a lake
  [/\b(coffee|cafe|café|brunch|breakfast|latte)\b/i, '1495474472287-4d71bcdd2085'],             // coffee cups
  [/\b(dinner|supper|potluck|party|feast|restaurant|food|picnic)\b/i, '1528605248644-14dd04022da1'], // friends at a long table
];

export function ideaPhoto(idea: Pick<Idea, 'title' | 'description'>): string | null {
  const text = `${idea.title} ${idea.description ?? ''}`;
  const hit = BY_WORD.find(([re]) => re.test(text));
  return hit ? unsplash(hit[1]) : null;
}
