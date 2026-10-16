// Categories are referred to by id everywhere — filters, summaries, counts —
// never by name or color, so renaming one changes nothing else. Built-ins
// have fixed ids, matching the rows seeded in
// supabase/migrations/20261019_calendars_categories_privacy.sql.

import { Category } from '../types';

const builtIn = (n: number, name: string, color: string, icon: string): Category => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, name, color, icon,
  is_default: true, owner_id: null, group_id: null, created_at: '2026-10-19T00:00:00Z',
});

export const DEFAULT_CATEGORIES: Category[] = [
  builtIn(1, 'Meals', 'orange', 'restaurant'),
  builtIn(2, 'Outdoors', 'green', 'leaf'),
  builtIn(3, 'Kids', 'blue', 'happy'),
  builtIn(4, 'Holidays', 'red', 'gift'),
  builtIn(5, 'Errands', 'gray', 'cart'),
];

export const UNCATEGORIZED = 'uncategorized';

/**
 * The category for an id, or null — including for one you can't see (someone
 * else's personal category on a shared event), which then reads as uncategorized.
 */
export function categoryOf(id: string | null | undefined, categories: Category[]) {
  return (id && categories.find(c => c.id === id)) || null;
}

/** How many items fall in each category, keyed by id. Unknown ids count as uncategorized. */
export function countByCategory(items: { category_id?: string | null }[], categories: Category[]) {
  const counts = new Map<string, number>();
  items.forEach(i => {
    const key = categoryOf(i.category_id, categories)?.id ?? UNCATEGORIZED;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}
