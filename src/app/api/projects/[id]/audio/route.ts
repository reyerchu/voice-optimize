import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getSessionId } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** 串流原始音檔（支援 Range，供波形載入與播放 seek） */
export async function GET(req: Request, ctx: RouteContext<"/api/projects/[id]/audio">) {
  const { id } = await ctx.params;
  const sessionId = await getSessionId();
  if (!sessionId) return new Response("unauthorized", { status: 401 });

  const project = await prisma.project.findFirst({ where: { id, sessionId } });
  if (!project?.originalPath) return new Response("not found", { status: 404 });

  let fileStat;
  try {
    fileStat = await stat(project.originalPath);
  } catch {
    return new Response("not found", { status: 404 });
  }

  const total = fileStat.size;
  const contentType = project.mimeType || "audio/mpeg";
  const range = req.headers.get("range");

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : total - 1;
    if (start >= total || end >= total) {
      return new Response("range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${total}` },
      });
    }
    const stream = createReadStream(project.originalPath, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
      },
    });
  }

  const stream = createReadStream(project.originalPath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
    },
  });
}
