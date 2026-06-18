import { NavLink } from 'react-router-dom';
import { Settings, Globe, Plug, CreditCard, Users } from 'lucide-react';
import { cn } from '@/web/src/lib/cn';

const ITEMS = [
  { to: '/settings/general', label: 'General', icon: Settings },
  { to: '/settings/domains', label: 'Domains', icon: Globe },
  { to: '/settings/connectors', label: 'Connectors', icon: Plug },
  { to: '/settings/billing', label: 'Billing & Credits', icon: CreditCard },
  { to: '/settings/members', label: 'Members', icon: Users },
];

export function SettingsNav() {
  return (
    <nav className="w-56 shrink-0 border-r border-border bg-card p-3">
      <div className="flex flex-col gap-0.5">
        {ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn('flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors',
                isActive ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground')
            }
          >
            <Icon className="h-4 w-4" /> {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
