import { NextResponse } from "next/server";
import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import { getSessionId } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function ownedProject(id: string) {
  const sessionId = await getSessionId();
  if (!sessionId) return null;
  const project = await prisma.project.findFirst({
    where: { id, sessionId },
    include: { exports: { orderBy: { createdAt: "desc" } } },
  });
  return project;
}

/** 取得專案詳情：狀態、逐字稿、已匯出清單 */
export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  const project = await ownedProject(id);
  if (!project) return NextResponse.json({ error: "找不到專案" }, { status: 404 });

  return NextResponse.json({
    id: project.id,
    title: project.title,
    status: project.status,
    durationSec: project.durationSec,
    errorMessage: project.errorMessage,
    transcript: project.transcript,
    exports: project.exports.map((e) => ({
      id: e.id,
      durationSec: e.durationSec,
      sizeBytes: e.sizeBytes,
      createdAt: e.createdAt,
    })),
  });
}

/** 刪除專案（含磁碟檔案） */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  const project = await ownedProject(id);
  if (!project) return NextResponse.json({ error: "找不到專案" }, { status: 404 });

  if (project.originalPath) {
    await rm(dirname(project.originalPath), { recursive: true, force: true }).catch(() => {});
  }
  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
