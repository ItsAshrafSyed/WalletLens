import { createHmac } from "node:crypto";
import { z } from "zod";

const configSchema = z.object({
  UPSTASH_REDIS_REST_URL: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  STATS_HASH_KEY: z.string().min(32),
});
type StatsConfig = z.infer<typeof configSchema>;

function configuration(): StatsConfig | null {
  const values = {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    STATS_HASH_KEY: process.env.STATS_HASH_KEY,
  };
  if (Object.values(values).every((value) => !value)) return null;
  const parsed = configSchema.safeParse(values);
  if (!parsed.success) throw new Error("Stats configuration is incomplete.");
  return parsed.data;
}

const prefix = "walletlens:stats:";
const recordScript = `
redis.call('HINCRBY', KEYS[1], ARGV[1], 1)
redis.call('HINCRBY', KEYS[2], ARGV[1], 1)
if ARGV[1] == 'success' then redis.call('SADD', KEYS[3], ARGV[2]) end
return 1`;

const readScript = `
local result = {
  tonumber(redis.call('HGET', KEYS[1], 'success') or '0'),
  tonumber(redis.call('HGET', KEYS[1], 'failure') or '0'),
  redis.call('SCARD', KEYS[2])
}
for i = 3, #KEYS do
  table.insert(result, tonumber(redis.call('HGET', KEYS[i], 'success') or '0'))
  table.insert(result, tonumber(redis.call('HGET', KEYS[i], 'failure') or '0'))
end
return result`;

async function command(
  config: StatsConfig,
  body: (string | number)[],
  fetcher: typeof fetch,
) {
  const response = await fetcher(config.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error("Stats storage is unavailable.");
  const payload: unknown = await response.json();
  return payload;
}

export async function recordScan({
  wallet,
  outcome,
  now = new Date(),
  fetcher = fetch,
}: {
  wallet: string;
  outcome: "success" | "failure";
  now?: Date;
  fetcher?: typeof fetch;
}): Promise<void> {
  try {
    const config = configuration();
    if (!config) return;
    const digest =
      outcome === "success"
        ? createHmac("sha256", config.STATS_HASH_KEY)
            .update(wallet)
            .digest("hex")
        : "";
    const payload = await command(
      config,
      [
        "EVAL",
        recordScript,
        3,
        `${prefix}total`,
        `${prefix}day:${now.toISOString().slice(0, 10)}`,
        `${prefix}wallets`,
        outcome,
        digest,
      ],
      fetcher,
    );
    z.object({ result: z.literal(1) }).parse(payload);
  } catch {
    // Analytics must not change the outcome of a wallet scan or expose credentials.
    console.error({ event: "stats_write_failed" });
  }
}

export async function readStats({
  now = new Date(),
  fetcher = fetch,
}: { now?: Date; fetcher?: typeof fetch } = {}) {
  const config = configuration();
  if (!config) throw new Error("Stats are not configured.");
  const dates = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - (29 - index));
    return date.toISOString().slice(0, 10);
  });
  const payload = await command(
    config,
    [
      "EVAL",
      readScript,
      dates.length + 2,
      `${prefix}total`,
      `${prefix}wallets`,
      ...dates.map((date) => `${prefix}day:${date}`),
    ],
    fetcher,
  );
  const { result } = z
    .object({ result: z.array(z.number().int().nonnegative()).length(63) })
    .parse(payload);
  return {
    generatedAt: now.toISOString(),
    timezone: "UTC",
    successfulScans: result[0],
    failedScans: result[1],
    uniqueWallets: result[2],
    daily: dates.map((date, index) => ({
      date,
      successfulScans: result[3 + index * 2],
      failedScans: result[4 + index * 2],
    })),
  };
}
