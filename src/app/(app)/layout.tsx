import { eq } from "drizzle-orm";
import { db } from "@/db";
import { departments } from "@/db/schema";
import { MobileNav, TopNav } from "@/components/shell";
import { requireViewerPage } from "@/server/dal";
import { getUnreadCount } from "@/server/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewerPage();
  const [unread, dept] = await Promise.all([
    getUnreadCount(viewer),
    viewer.departmentId ? db.select({ name: departments.name }).from(departments).where(eq(departments.id, viewer.departmentId)) : Promise.resolve([]),
  ]);
  return (
    <>
      <TopNav
        viewer={{ name: viewer.name, email: viewer.email, image: viewer.image, role: viewer.role, departmentName: dept[0]?.name ?? null }}
        unread={unread}
      />
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:pb-16">{children}</main>
      <MobileNav role={viewer.role} />
    </>
  );
}
