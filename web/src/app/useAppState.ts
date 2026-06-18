import { useEffect, useState } from 'react';

export type AppTab = 'chat' | 'cowork' | 'code';

// Tiny persisted-state helper: reads once from localStorage, writes on change.
function persisted<T>(key: string, initial: T) {
  return function usePersisted(): [T, (v: T) => void] {
    const [value, setValue] = useState<T>(() => {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? initial : (JSON.parse(raw) as T);
      } catch {
        return initial;
      }
    });
    useEffect(() => {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore quota */ }
    }, [value]);
    return [value, setValue];
  };
}

const useTab = persisted<AppTab>('ezc.app.tab', 'chat');
const useCollapsed = persisted<boolean>('ezc.app.sidebarCollapsed', false);
// Project existence drives the Code tab (empty state vs sandbox). Persisted so the
// shell remembers a project across reloads until real project wiring lands.
const useHasProject = persisted<boolean>('ezc.app.hasProject', false);

export function useAppState() {
  const [tab, setTab] = useTab();
  const [collapsed, setCollapsed] = useCollapsed();
  const [hasProject, setHasProject] = useHasProject();
  return {
    tab, setTab,
    collapsed, setCollapsed,
    toggleCollapsed: () => setCollapsed(!collapsed),
    hasProject, setHasProject,
  };
}
