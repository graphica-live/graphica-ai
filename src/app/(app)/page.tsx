import { Suspense } from "react";
import { GenerationForm } from "@/components/generation/GenerationForm";

export default function GeneratePage() {
  return (
    <Suspense fallback={null}>
      <GenerationForm />
    </Suspense>
  );
}
