import { recordVerificationResult } from "../../core/index.ts";
import { parseVerificationResultInput } from "../types.ts";

/**
 * Executes the `record_verification_result` MCP tool.
 */
export const recordVerificationResultTool = (params: unknown): unknown => {
  return recordVerificationResult(parseVerificationResultInput(params));
};
