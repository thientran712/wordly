"use client";

import { usePathname } from "next/navigation";

// AppSidebar's mobile hamburger trigger is `fixed top-3 left-3`, so every
// other route needs top padding here to keep content clear of it — except
// /practice, which hides that hamburger (it has its own in-page header with
// a back button + session-list toggle instead), so the padding there was
// just dead empty space above a header that didn't need clearing.
export default function MainContent({ children }) {
  const pathname = usePathname();
  const isPractice = pathname.startsWith("/practice");

  return (
    <div className={`flex-1 min-w-0 ${isPractice ? "" : "pt-14 md:pt-0"}`}>
      {children}
    </div>
  );
}
