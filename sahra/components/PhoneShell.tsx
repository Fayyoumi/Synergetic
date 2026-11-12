import type { ReactNode } from "react";
import { WeddingLights } from "./WeddingLights";

/** Phone-width page frame with the wedding lights across the top. */
export function PhoneShell({ children, lights = true }: { children: ReactNode; lights?: boolean }) {
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col">
      {lights && <WeddingLights />}
      <main className="flex flex-1 flex-col gap-4 px-5 pb-6">{children}</main>
    </div>
  );
}
