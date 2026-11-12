"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar, Button } from "@/components/ui";
import { setBanned, setUserRole } from "@/server/actions/manage";

type Row = { id: string; name: string; email: string; role: "member" | "staff" | "admin"; banned: boolean; departmentId: string | null; createdAt: string };

export function PeopleTable({ q, rows, depts, selfId }: { q: string; rows: Row[]; depts: { id: string; name: string }[]; selfId: string }) {
  const router = useRouter();
  const path = usePathname();
  const [term, setTerm] = useState(q);
  const [pending, start] = useTransition();

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.replace(`${path}?q=${encodeURIComponent(term)}`);
        }}
        className="relative max-w-md"
      >
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by name or email (empty = staff, admins, suspended)"
          className="h-11 w-full rounded-full border border-line-strong bg-surface pl-10 pr-4 text-sm outline-none focus:border-brand"
        />
      </form>
      <div className="card divide-y divide-line overflow-hidden">
        {rows.length === 0 && <div className="p-8 text-center text-sm text-ink-muted">No one found.</div>}
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <Avatar name={r.name} size={34} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {r.name} {r.banned && <span className="ml-1 rounded bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-danger">suspended</span>}
              </div>
              <div className="truncate text-xs text-ink-muted">{r.email}</div>
            </div>
            <select
              disabled={pending || r.id === selfId}
              value={r.role === "staff" ? `staff:${r.departmentId}` : r.role}
              onChange={(e) => {
                const v = e.target.value;
                const [role, dept] = v.split(":") as ["member" | "staff" | "admin", string | undefined];
                act(() => setUserRole({ userId: r.id, role, departmentId: dept ?? null }), `${r.name} is now ${role === "staff" ? `staff (${depts.find((d) => d.id === dept)?.name})` : role}.`);
              }}
              className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm"
              aria-label={`Role for ${r.name}`}
            >
              <option value="member">Member</option>
              <optgroup label="Department staff">
                {depts.map((d) => (
                  <option key={d.id} value={`staff:${d.id}`}>
                    Staff · {d.name}
                  </option>
                ))}
              </optgroup>
              <option value="admin">Admin</option>
            </select>
            {r.role !== "admin" && (
              <Button
                size="sm"
                variant={r.banned ? "secondary" : "ghost"}
                className={r.banned ? "" : "!text-danger"}
                disabled={pending}
                onClick={() => act(() => setBanned({ userId: r.id, banned: !r.banned, reason: "Suspended by admin" }), r.banned ? "Reinstated." : "Suspended and signed out.")}
              >
                {r.banned ? "Reinstate" : "Suspend"}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
