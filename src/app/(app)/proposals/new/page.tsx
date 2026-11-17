import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { requireViewerPage } from "@/server/dal";
import { getViewerCohort } from "@/server/proposal-queries";
import { getTaxonomy } from "@/server/queries";
import { ProposeForm } from "./propose-form";

export const metadata = { title: "Propose something" };

export default async function NewProposalPage() {
  const viewer = await requireViewerPage();
  const [tax, cohort] = await Promise.all([getTaxonomy(), getViewerCohort(viewer)]);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/proposals" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={15} /> Proposals
      </Link>
      <div className="animate-rise">
        <h1 className="title">Propose something</h1>
        <p className="mt-2 text-[15px] text-ink-muted">
          Something broken belongs on the <Link href="/issues/new" className="font-medium text-brand hover:underline">issue board</Link>. This is for things that
          should exist: a space opened, a timing changed, a new event. Be specific — a clear ask is easier to say yes to.
        </p>
      </div>
      <ProposeForm departments={tax.departments.map((d) => ({ id: d.id, name: d.name }))} cohort={cohort} />
    </div>
  );
}
