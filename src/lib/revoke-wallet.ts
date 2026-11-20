import {
  AccountRole,
  decompileTransactionMessage,
  getCompiledTransactionMessageDecoder,
  getBase58Decoder,
  getBase64Encoder,
  getTransactionDecoder,
  isTransactionSendingSigner,
  type TransactionSigner,
} from "@solana/kit";
import { TOKEN_PROGRAMS } from "./contracts";
import { assertRevokeApproval, type PreparedRevoke } from "./revoke-contracts";

export async function sendPreparedRevoke({
  prepared,
  connectedAddress,
  scannedWallet,
  demo,
  signer,
  versions,
  now,
}: {
  prepared: PreparedRevoke;
  connectedAddress: string | null;
  scannedWallet: string;
  demo: boolean;
  signer: TransactionSigner | null;
  versions: ReadonlySet<"legacy" | 0 | 1>;
  now?: number;
}) {
  assertRevokeApproval({
    prepared,
    connectedAddress,
    scannedWallet,
    demo,
    now,
  });
  if (
    !signer ||
    !isTransactionSendingSigner(signer) ||
    signer.address !== prepared.owner
  )
    throw new Error(
      "This wallet cannot sign and send for this token account owner.",
    );
  if (!versions.has(prepared.version))
    throw new Error(
      "This wallet does not support the prepared transaction version.",
    );
  const transaction = getTransactionDecoder().decode(
    getBase64Encoder().encode(prepared.transaction),
  );
  if (
    Object.keys(transaction.signatures).length !== 1 ||
    !(prepared.owner in transaction.signatures)
  )
    throw new Error(
      "The prepared transaction has unexpected signers. Refresh the report.",
    );
  const compiled = getCompiledTransactionMessageDecoder().decode(
    transaction.messageBytes,
  );
  const message = decompileTransactionMessage(compiled, {
    lastValidBlockHeight: BigInt(prepared.lastValidBlockHeight),
  });
  const instruction = message.instructions[0];
  const program = TOKEN_PROGRAMS.find(
    (item) => item.label === prepared.program,
  );
  if (
    compiled.staticAccounts.length !== 3 ||
    message.version !== prepared.version ||
    message.feePayer.address !== prepared.owner ||
    !("blockhash" in message.lifetimeConstraint) ||
    message.lifetimeConstraint.blockhash !== prepared.blockhash ||
    message.instructions.length !== 1 ||
    instruction?.programAddress !== program?.id ||
    instruction.data?.length !== 1 ||
    instruction.data[0] !== 5 ||
    instruction.accounts?.length !== 2 ||
    instruction.accounts[0].address !== prepared.account ||
    instruction.accounts[0].role !== AccountRole.WRITABLE ||
    instruction.accounts[1].address !== prepared.owner ||
    instruction.accounts[1].role !== AccountRole.WRITABLE_SIGNER ||
    (message.version === 1 &&
      (message.config?.priorityFeeLamports ?? 0n) !== 0n)
  )
    throw new Error(
      "The transaction does not match the reviewed revoke. Nothing was sent to your wallet.",
    );
  const signatures = await signer.signAndSendTransactions([transaction]);
  const bytes = signatures[0];
  if (!bytes || bytes.length !== 64)
    throw new Error(
      "The wallet did not return a valid signature. Check wallet activity before retrying.",
    );
  return getBase58Decoder().decode(bytes);
}
