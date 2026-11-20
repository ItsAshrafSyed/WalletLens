import { statusRequest } from "../../../../lib/revoke-contracts";
import { checkRevokeStatus, RevokeError } from "../../../../lib/revoke";
import {
  revokeBody,
  revokeFailure,
  revokeJson,
  revokeRpcUrl,
} from "../../../../lib/revoke-http";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    const input = statusRequest.safeParse(await revokeBody(request));
    if (!input.success)
      throw new RevokeError(
        "Enter a valid transaction signature and lifetime.",
        400,
      );
    return revokeJson(
      await checkRevokeStatus({ input: input.data, rpcUrl: revokeRpcUrl() }),
    );
  } catch (error) {
    return revokeFailure(error);
  }
}
