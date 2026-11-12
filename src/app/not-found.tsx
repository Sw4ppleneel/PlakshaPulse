import Link from "next/link";
import { Logo, buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="dot-grid flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo size={30} />
      <h1 className="font-display mt-4 text-4xl">Nothing here</h1>
      <p className="max-w-sm text-ink-muted">That issue doesn&apos;t exist, was removed, or you don&apos;t have access to it.</p>
      <Link href="/board" className={buttonClass("primary", "md", "mt-2")}>
        Back to the board
      </Link>
    </div>
  );
}
