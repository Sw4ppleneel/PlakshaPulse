import { eq } from "drizzle-orm";
import { PageTransition } from "@/components/motion";
import { BottomNav, MobileTop, Sidebar } from "@/components/shell";
import { db } from "@/db";
import { departments } from "@/db/schema";
import { getReviewCount } from "@/server/admin-queries";
import { isMod, requireViewerPage } from "@/server/dal";
import { getUnreadCount } from "@/server/queries";

/**
 * Every signed-in screen: a sidebar at lg and up, a floating bottom nav on phones, and one
 * column of content between them. Both navs live here so they persist and their pills slide.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewerPage();
  const [unread, waiting, dept] = await Promise.all([
    getUnreadCount(viewer),
    isMod(viewer) ? getReviewCount() : Promise.resolve(0),
    viewer.departmentId ? db.select({ name: departments.name }).from(departments).where(eq(departments.id, viewer.departmentId)) : Promise.resolve([]),
  ]);
  const lite = { name: viewer.name, email: viewer.email, image: viewer.image, role: viewer.role, departmentName: dept[0]?.name ?? null };
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-bg">
        Skip to content
      </a>
      <Sidebar viewer={lite} unread={unread} waiting={waiting} />
      <div className="lg:pl-[var(--sidebar-w)] print:!pl-0">
        <MobileTop viewer={lite} unread={unread} />
        <main id="main" className="pb-nav mx-auto w-full max-w-[1120px] px-5 pt-4 lg:px-10 lg:pt-10 print:max-w-none print:p-0">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <BottomNav role={viewer.role} waiting={waiting} />
    </>
  );
}
