import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getAnthropic, SHOWNOTES_MODEL, CLAUDE_CODE_SYSTEM } from "@/lib/anthropic";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Seg = { text: string };

/** 由逐字稿產生標題、摘要、章節、社群貼文（Claude） */
export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/shownotes">) {
  const { id } = await ctx.params;
  const sessionId = await getSessionId();
  if (!sessionId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const project = await prisma.project.findFirst({ where: { id, sessionId } });
  if (!project) return NextResponse.json({ error: "找不到專案" }, { status: 404 });

  const transcript = project.transcript as { segments?: Seg[] } | null;
  const fullText = (transcript?.segments ?? []).map((s) => s.text).join(" ").trim();
  if (!fullText) {
    return NextResponse.json({ error: "尚無逐字稿可供分析" }, { status: 400 });
  }

  const prompt = `以下是一集 Podcast 的逐字稿。請用繁體中文產出可直接使用的後製素材，並嚴格以 JSON 回覆（不要加任何說明文字或 markdown 圍欄）：

{
  "titles": ["3 個吸引人的集數標題"],
  "summary": "100 字內的集數摘要",
  "showNotes": "條列式重點（每行以 - 開頭，5~8 點）",
  "chapters": ["可能的章節分段標題，3~6 個"],
  "social": "一則適合 IG/Threads 的貼文，含 2~3 個 hashtag"
}

逐字稿：
"""
${fullText.slice(0, 12000)}
"""`;

  try {
    const client = getAnthropic();
    const msg = await client.messages.create({
      model: SHOWNOTES_MODEL,
      max_tokens: 2000,
      system: [{ type: "text", text: CLAUDE_CODE_SYSTEM }],
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    const parsed =
      jsonStart >= 0 && jsonEnd > jsonStart
        ? JSON.parse(text.slice(jsonStart, jsonEnd + 1))
        : { raw: text };

    return NextResponse.json({ result: parsed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message.slice(0, 300) : "產生失敗" },
      { status: 502 },
    );
  }
}
