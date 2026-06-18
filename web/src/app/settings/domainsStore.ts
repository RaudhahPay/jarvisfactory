// Local custom-domain registry. NOTE: DNS verification and provisioning have no
// backend yet — "Verify" simulates a re-check. This store is the UI seam where a
// real domains API plugs in later.

export type DomainStatus = 'pending' | 'verified' | 'error';
export type CustomDomain = { id: string; domain: string; status: DomainStatus; addedAt: number };

const KEY = 'ezc.customDomains';

function readAll(): CustomDomain[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') as CustomDomain[]; } catch { return []; }
}
function writeAll(list: CustomDomain[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

export function listDomains(): CustomDomain[] {
  return readAll().sort((a, b) => b.addedAt - a.addedAt);
}

export function addDomain(domain: string): CustomDomain {
  const id = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).slice(0, 8);
  const d: CustomDomain = { id, domain: domain.trim().toLowerCase(), status: 'pending', addedAt: Date.now() };
  writeAll([d, ...readAll()]);
  return d;
}

export function setDomainStatus(id: string, status: DomainStatus): CustomDomain[] {
  const list = readAll().map((d) => (d.id === id ? { ...d, status } : d));
  writeAll(list);
  return list;
}

export function removeDomain(id: string): CustomDomain[] {
  const list = readAll().filter((d) => d.id !== id);
  writeAll(list);
  return list;
}

/** Loose hostname validation (no protocol, has a dot, valid labels). */
export function isValidDomain(input: string): boolean {
  const d = input.trim().toLowerCase();
  return /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(d);
}

/** DNS records the user must add for a custom domain (display placeholders). */
export function dnsRecords(domain: string): { type: string; name: string; value: string }[] {
  const apex = domain.split('.').length <= 2;
  return apex
    ? [{ type: 'A', name: '@', value: '76.76.21.21' }, { type: 'CNAME', name: 'www', value: 'cname.ezclaude.app' }]
    : [{ type: 'CNAME', name: domain.split('.')[0], value: 'cname.ezclaude.app' }];
}
