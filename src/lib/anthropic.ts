import Anthropic from "@anthropic-ai/sdk";

/**
 * 建立 Anthropic client。
 * Max 訂閱的 OAuth token（sk-ant-oat...）需用 authToken(Bearer)，
 * SDK 會自動附上 OAuth beta header；一般 API key 則用 apiKey。
 */
export function getAnthropic(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY ?? "";
  if (key.startsWith("sk-ant-oat")) {
    return new Anthropic({ authToken: key });
  }
  return new Anthropic({ apiKey: key });
}

export const SHOWNOTES_MODEL = "claude-sonnet-4-6";

/** OAuth token 需要 Claude Code 身分作為第一個 system 區塊 */
export const CLAUDE_CODE_SYSTEM =
  "You are Claude Code, Anthropic's official CLI for Claude.";
