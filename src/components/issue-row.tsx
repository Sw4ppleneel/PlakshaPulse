import { MapPin, MessageSquare } from "lucide-react";
import Link from "next/link";
import { ACTIVE_STATUSES } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import type { BoardIssue } from "@/server/queries";
import { MetooButton } from "./metoo-button";
import { ApprovalTag } from "./review";
import { CategoryIcon, SlaChip, StatusPill } from "./ui";

type Cat = { id: string; name: string; icon: string; color: string };

export function IssueRow({ issue, cat, locationName }: { issue: BoardIssue; cat?: Cat; locationName?: string }) {
  const active = ACTIVE_STATUSES.includes(issue.status);
  return (
    <div className="group relative flex items-start gap-3 rounded-[22px] px-3 py-3.5 transition-colors hover:bg-surface-2 sm:gap-4 sm:px-4">
      <MetooButton issueId={issue.id} count={issue.metooCount} voted={issue.viewerVoted} disabled={!active || issue.approval !== "approved"} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
          {cat && (
            <span className="inline-flex items-center gap-1.5 font-medium text-ink-2">
              <CategoryIcon icon={cat.icon} color={cat.color} size={13} />
              {cat.name}
            </span>
          )}
          {locationName && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin size={12} /> {locationName}
            </span>
          )}
          <span className="tabular">#{issue.number}</span>
        </div>
        <Link href={`/issues/${issue.number}`} className="mt-0.5 block font-semibold leading-snug text-ink after:absolute after:inset-0 ">
          {issue.title}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          {issue.approval === "approved" ? (
            <>
              <StatusPill status={issue.status} />
              <SlaChip dueAt={issue.dueAt} status={issue.status} />
            </>
          ) : (
            <ApprovalTag approval={issue.approval} />
          )}
          <span suppressHydrationWarning>{timeAgo(issue.createdAt)}</span>
          {issue.commentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare size={12} /> {issue.commentCount}
            </span>
          )}
        </div>
      </div>
      {issue.photoId && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/attachments/${issue.photoId}`} alt="" className="hidden size-16 shrink-0 rounded-xl object-cover sm:block" loading="lazy" />
      )}
    </div>
  );
}
