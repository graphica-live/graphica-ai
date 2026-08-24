import { Suspense } from "react";
import { GenerationWorkspace } from "@/components/generation/GenerationWorkspace";

export default function GeneratePage() {
  return (
    <Suspense fallback={null}>
      <GenerationWorkspace />
    </Suspense>
  );
}
