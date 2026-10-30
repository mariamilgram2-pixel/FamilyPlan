// One way to make plans, from anywhere.
//
// "New Plan" always opens the same sheet: describe it, fill in what's still
// open, then find a time, lock it in, ask the group, or save the idea. Home, Calendar, and Plans all open
// it from here, and refresh when `version` changes. The same provider holds
// the Add Memories sheet for after an event.

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import { DEMO_MEMBERS, DEMO_ME, isDemoGroup, upsertDemoIdea } from '../lib/demo';
import CreateIdeaSheet, { PlanEntry } from '../screens/ideas/CreateIdeaScreen';
import { EventComposer } from '../screens/calendar/EventViews';
import { todayKey } from '../screens/calendar/dates';
import { Idea } from '../types';
import MemorySheet, { MemoryTarget } from './MemorySheet';

export interface PlanPrefill {
  title?: string;
  location?: string;
  notes?: string;
  people?: string[];       // user ids
  groups?: string[];       // group ids
  date?: string | null;    // YYYY-MM-DD
  start?: string;          // HH:MM
  end?: string;
  /** Raw “Describe it” sentence. The New Plan sheet parses it on open. */
  sentence?: string;
}

interface PlanComposerValue {
  /** The New Plan sheet, optionally pre-filled ("Do it again", "with Ana"). */
  newPlan: (prefill?: PlanPrefill) => void;
  /** Straight to the calendar, when the time is already known. */
  addEvent: (prefill: PlanPrefill) => void;
  /** Find a time / send the invite for an existing idea. */
  planIdea: (entry: PlanEntry) => void;
  /** After an event: photos and/or a note for everyone who came. */
  addMemories: (target: MemoryTarget) => void;
  /** Bumps whenever something is saved, so screens can refetch. */
  version: number;
  changed: () => void;
}

const Ctx = createContext<PlanComposerValue | null>(null);

export function PlanComposerProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const { activeGroup } = useGroup();
  const isDemo = isDemoGroup(activeGroup);
  const meId = user?.id ?? (isDemo ? DEMO_ME : null);
  const myName = (profile?.full_name ?? (isDemo ? DEMO_MEMBERS[0].full_name : null) ?? 'Someone').split(' ')[0];

  const [ideaSheet, setIdeaSheet] = useState<{ prefill?: PlanPrefill; entry?: PlanEntry } | null>(null);
  const [eventSheet, setEventSheet] = useState<PlanPrefill | null>(null);
  const [memoryTarget, setMemoryTarget] = useState<MemoryTarget | null>(null);
  const [version, setVersion] = useState(0);
  const changed = useCallback(() => setVersion(v => v + 1), []);

  const value = useMemo<PlanComposerValue>(() => ({
    newPlan: (prefill) => setIdeaSheet({ prefill }),
    addEvent: (prefill) => setEventSheet(prefill),
    planIdea: (entry) => setIdeaSheet({ entry }),
    addMemories: (target) => setMemoryTarget(target),
    version,
    changed,
  }), [version, changed]);

  function onIdeaSaved(idea?: Idea) {
    if (isDemo && idea) upsertDemoIdea(idea);
    changed();
  }

  const me = profile ?? (isDemo ? DEMO_MEMBERS[0] : null);

  return (
    <Ctx.Provider value={value}>
      {children}
      <CreateIdeaSheet
        visible={!!ideaSheet}
        entry={ideaSheet?.entry ?? null}
        prefill={ideaSheet?.prefill}
        onClose={() => setIdeaSheet(null)}
        onSaved={onIdeaSaved}
      />
      <EventComposer
        visible={!!eventSheet}
        prefill={eventSheet}
        onClose={() => setEventSheet(null)}
        onSaved={changed}
        initialDate={eventSheet?.date ?? todayKey()}
        group={activeGroup}
        meId={meId}
        members={isDemo ? DEMO_MEMBERS : me ? [me] : []}
        suggestedIds={[]}
        isDemo={isDemo}
        myName={myName}
      />
      <MemorySheet
        target={memoryTarget}
        onClose={() => setMemoryTarget(null)}
        onSaved={changed}
        meId={meId}
        myName={myName}
        isDemo={isDemo}
      />
    </Ctx.Provider>
  );
}

export function usePlanComposer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlanComposer must be used within PlanComposerProvider');
  return ctx;
}
