import { RevokeError } from "./revoke";

export function revokeJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function revokeBody(request: Request): Promise<unknown> {
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    throw new RevokeError("Cross-origin requests are not supported.", 403);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new RevokeError("Send a JSON request.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new RevokeError("Send a JSON request.", 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 2048) {
      await reader.cancel();
      throw new RevokeError("Request is too large.", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RevokeError("Send valid JSON.", 400);
  }
}

export function revokeRpcUrl() {
  try {
    const value = process.env.SOLANA_RPC_URL;
    if (!value || new URL(value).protocol !== "https:") throw new Error();
    return value;
  } catch {
    throw new RevokeError(
      "The site owner must configure a mainnet HTTPS RPC endpoint.",
      503,
    );
  }
}

export function revokeFailure(error: unknown) {
  return error instanceof RevokeError
    ? revokeJson({ error: error.message }, error.status)
    : revokeJson(
        {
          error:
            "The request could not be completed. Refresh and try again. No automatic transaction retry was made.",
        },
        502,
      );
}
