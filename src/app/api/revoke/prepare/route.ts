import { revokeRequest } from "../../../../lib/revoke-contracts";
import { prepareRevoke, RevokeError } from "../../../../lib/revoke";
import {
  revokeBody,
  revokeFailure,
  revokeJson,
  revokeRpcUrl,
} from "../../../../lib/revoke-http";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const input = revokeRequest.safeParse(await revokeBody(request));
    if (!input.success)
      throw new RevokeError("Enter a valid token account and owner.", 400);
    return revokeJson(
      await prepareRevoke({ input: input.data, rpcUrl: revokeRpcUrl() }),
    );
  } catch (error) {
    return revokeFailure(error);
  }
}
