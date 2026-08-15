export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startGenerationPoller } = await import("@/lib/jobs/poller");
    startGenerationPoller();
  }
}
