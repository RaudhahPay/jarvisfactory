import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/** Copyable DNS records table for a pending custom domain. */
export function DnsRecordsTable({ records }: { records: { type: string; name: string; value: string }[] }) {
  const [copied, setCopied] = useState('');
  function copy(v: string) {
    navigator.clipboard?.writeText(v).then(() => { setCopied(v); setTimeout(() => setCopied(''), 1200); });
  }
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-secondary/60 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Value</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="font-mono">
          {records.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <td className="px-3 py-2">{r.type}</td>
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2">{r.value}</td>
              <td className="px-2 py-2">
                <button onClick={() => copy(r.value)} className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-secondary" title="Copy value">
                  {copied === r.value ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
