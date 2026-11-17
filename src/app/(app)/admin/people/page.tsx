import { notFound } from "next/navigation";
import { requireViewerPage } from "@/server/dal";
import { searchPeople } from "@/server/admin-queries";
import { PeopleTable } from "./people-table";

export const metadata = { title: "People" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const viewer = await requireViewerPage();
  if (viewer.role !== "admin") notFound();
  const q = ((await searchParams).q ?? "").slice(0, 80);
  const { rows, depts } = await searchPeople(q);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="title">People & roles</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-ink-muted">
          Give department staff the ability to update issues routed to them. Every change is recorded in the private audit log.
        </p>
      </div>
      <PeopleTable
        q={q}
        selfId={viewer.id}
        depts={depts}
        rows={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
      />
    </div>
  );
}
