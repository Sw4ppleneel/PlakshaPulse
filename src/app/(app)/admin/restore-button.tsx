"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { moderate } from "@/server/actions/manage";
import { setProposalHidden } from "@/server/actions/proposals";

/** Makes a hidden or rejected item public again. */
export function RestoreButton({ kind, id }: { kind: "issue" | "proposal" | "comment"; id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = kind === "proposal" ? await setProposalHidden(id, false) : await moderate({ targetType: kind, targetId: id, hide: false });
          if (!r.ok) return void toast.error(r.error);
          toast.success("Restored. It's public again.");
          router.refresh();
        })
      }
    >
      <RotateCcw size={14} aria-hidden /> Restore
    </Button>
  );
}
