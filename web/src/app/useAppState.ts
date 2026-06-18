import { useEffect, useState } from 'react';

export type AppTab = 'chat' | 'cowork' | 'code';

/** Sidebar collapse, persisted across reloads. (Active section is now URL-driven.) */
export function useSidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ezc.app.sidebarCollapsed') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try { localStorage.setItem('ezc.app.sidebarCollapsed', collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);
  return { collapsed, toggleCollapsed: () => setCollapsed((v) => !v) };
}
