"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { dismissFlags, moderate } from "@/server/actions/manage";

export function FlagActions({ targetType, targetId, hidden }: { targetType: "issue" | "comment"; targetId: string; hidden: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg);
      router.refresh();
    });
  return (
    <div className="mt-2 flex gap-2">
      {!hidden && (
        <Button size="sm" variant="danger" disabled={pending} onClick={() => go(() => moderate({ targetType, targetId, hide: true, reason: "Removed after community flags" }), "Hidden.")}>
          Hide
        </Button>
      )}
      {hidden && (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => go(() => moderate({ targetType, targetId, hide: false }), "Restored.")}>
          Restore
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => go(() => dismissFlags({ targetType, targetId }), "Flags dismissed.")}>
        Keep — dismiss flags
      </Button>
    </div>
  );
}
