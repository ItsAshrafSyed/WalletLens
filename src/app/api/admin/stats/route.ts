import { createHash, timingSafeEqual } from "node:crypto";
import { readStats } from "../../../../lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Authorization" },
  });
}

export async function GET(request: Request) {
  const token = process.env.STATS_ADMIN_TOKEN;
  if (!token || token.length < 32) return json({ error: "Not found." }, 404);
  const authorization = request.headers.get("authorization") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(authorization), digest(`Bearer ${token}`)))
    return json({ error: "Unauthorized." }, 401);
  try {
    return json(await readStats(), 200);
  } catch {
    return json(
      {
        error:
          "Stats are unavailable. Check the server configuration and storage service.",
      },
      503,
    );
  }
}
