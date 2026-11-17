import { requireViewerPage } from "@/server/dal";
import { getTaxonomy } from "@/server/queries";
import { ReportForm } from "./report-form";

export const metadata = { title: "Report an issue" };

export default async function NewIssuePage() {
  await requireViewerPage();
  const tax = await getTaxonomy();
  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <h1 className="title">Report an issue</h1>
        <p className="mt-1 text-[15px] text-ink-muted">Takes 30 seconds. If someone already reported it, we&apos;ll point you to it so your voice adds up.</p>
      </div>
      <ReportForm
        categories={tax.categories}
        locations={tax.locations}
        departments={Object.fromEntries(tax.departments.map((d) => [d.id, d.name]))}
      />
    </div>
  );
}
