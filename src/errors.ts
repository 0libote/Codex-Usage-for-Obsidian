export type ErrorCode =
  | "HELPER_NOT_INSTALLED" | "DOWNLOAD_FAILED" | "CHECKSUM_FAILED"
  | "HELPER_CANNOT_RUN" | "COMMAND_FAILED" | "PARSE_FAILED"
  | "PROVIDER_NOT_CONFIGURED" | "UNSUPPORTED_FEATURE"
  | "NETWORK_UNAVAILABLE" | "MANIFEST_UNAVAILABLE";

export class CodexUsageError extends Error {
  constructor(public code: ErrorCode, message: string, public details?: string) {
    super(message);
    this.name = "CodexUsageError";
  }
}
