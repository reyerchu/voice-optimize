import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getSessionId } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** 下載已匯出的 MP3 成品 */
export async function GET(_req: Request, ctx: RouteContext<"/api/exports/[id]/download">) {
  const { id } = await ctx.params;
  const sessionId = await getSessionId();
  if (!sessionId) return new Response("unauthorized", { status: 401 });

  const exp = await prisma.export.findUnique({
    where: { id },
    include: { project: true },
  });
  if (!exp || exp.project.sessionId !== sessionId || !exp.path) {
    return new Response("not found", { status: 404 });
  }

  let fileStat;
  try {
    fileStat = await stat(exp.path);
  } catch {
    return new Response("not found", { status: 404 });
  }

  const safeTitle = exp.project.title.replace(/[^\w一-龥.-]+/g, "_").slice(0, 60) || "podcast";
  const stream = createReadStream(exp.path);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(fileStat.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle)}.mp3`,
    },
  });
}
