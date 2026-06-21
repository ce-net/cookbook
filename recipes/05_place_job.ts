/**
 * Recipe 05 — Place a job and poll it through its lifecycle.
 *
 * Teaches: `POST /jobs/bid` (broadcast a container job any host with capacity may take) then
 * `GET /jobs/:id` to watch it move pending -> running -> settled/failed. The bid amount is locked
 * from your balance the moment the bid lands.
 *
 * Run:  npx tsx recipes/05_place_job.ts
 *
 * needs: docker (a Docker-capable host on the mesh actually runs the container). On a fresh
 * zero-balance node the bid returns 402 — treated as the expected contract outcome here.
 */
import { CeClient, Amount, CeInsufficientFundsError } from "@ce-net/sdk";

async function main(): Promise<void> {
  const baseUrl = process.env["CE_BASE_URL"] ?? "http://127.0.0.1:8844";
  const token = process.env["CE_API_TOKEN"];
  const ce = token ? new CeClient({ baseUrl, token }) : CeClient.local();

  let jobId: string;
  try {
    jobId = await ce.jobs.bid({
      image: "alpine:latest",
      cmd: ["echo", "hello from CE"],
      cpuCores: 1,
      memMb: 64,
      durationSecs: 30,
      bid: Amount.fromCredits("1"),
    });
  } catch (e) {
    if (e instanceof CeInsufficientFundsError) {
      console.log("402 Payment Required (expected on a zero-balance no-mine node)");
      console.log("RECIPE_OK 05_place_job (402 expected)");
      return;
    }
    throw e;
  }
  console.log(`placed job ${jobId}`);

  // Poll a few times; without a Docker host the job may stay pending — fine for the demo.
  for (let i = 0; i < 3; i++) {
    const job = await ce.jobs.get(jobId);
    console.log(`  status: ${job.status}`);
    if (job.status === "settled" || job.status === "failed") break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("RECIPE_OK 05_place_job");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
