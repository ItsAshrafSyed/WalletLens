import { scanRequest } from "../../../lib/contracts";
import { ScanError, scanWallet } from "../../../lib/scan";

export const runtime = "nodejs";
export const maxDuration = 30;

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    return json({ error: "Send a JSON request." }, 415);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Cross-origin requests are not supported." }, 403);
  let body: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Enter a wallet address." }, 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1024) {
        await reader.cancel();
        return json({ error: "Request is too large." }, 413);
      }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return json({ error: "Send a valid JSON request." }, 400);
  }
  const parsed = scanRequest.safeParse(body);
  if (!parsed.success)
    return json({ error: "Enter a valid Solana wallet address." }, 400);
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl)
    return json(
      {
        error:
          "Live scanning is not configured yet. The site owner needs to set SOLANA_RPC_URL. You can explore the demo below.",
      },
      503,
    );
  try {
    if (new URL(rpcUrl).protocol !== "https:")
      throw new Error("Invalid RPC configuration");
  } catch {
    return json(
      {
        error:
          "The RPC endpoint is not configured correctly. Please contact the site owner.",
      },
      503,
    );
  }
  try {
    return json(await scanWallet({ wallet: parsed.data.address, rpcUrl }), 200);
  } catch (error) {
    if (error instanceof ScanError)
      return json({ error: error.message }, error.status);
    return json(
      { error: "The scan could not be completed. Please try again." },
      500,
    );
  }
}
