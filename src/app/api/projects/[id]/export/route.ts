import { NextResponse } from "next/server";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getSessionId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { exportMp3, type Segment, type ProcessOptions } from "@/lib/audio";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const EXPORT_DIR = process.env.EXPORT_DIR ?? "/home/reyerchu/voice-optimize/exports";

type ExportBody = {
  keepSegments?: Segment[];
  options?: Partial<ProcessOptions>;
};

/** 依保留區段 + 處理選項匯出 MP3 */
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/export">) {
  const { id } = await ctx.params;
  const sessionId = await getSessionId();
  if (!sessionId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const project = await prisma.project.findFirst({ where: { id, sessionId } });
  if (!project?.originalPath) {
    return NextResponse.json({ error: "找不到專案" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as ExportBody;
  const keepSegments: Segment[] = Array.isArray(body.keepSegments) ? body.keepSegments : [];
  const options: ProcessOptions = {
    denoise: body.options?.denoise ?? false,
    loudnorm: body.options?.loudnorm ?? false,
    trimSilence: body.options?.trimSilence ?? false,
  };

  await mkdir(EXPORT_DIR, { recursive: true });

  const exportRecord = await prisma.export.create({
    data: {
      projectId: project.id,
      path: "",
      durationSec: 0,
      sizeBytes: 0,
      keepSegments: keepSegments as unknown as object,
    },
  });

  const outputPath = join(EXPORT_DIR, `${exportRecord.id}.mp3`);

  try {
    const { durationSec, sizeBytes } = await exportMp3({
      inputPath: project.originalPath,
      outputPath,
      keepSegments,
      options,
      totalDurationSec: project.durationSec ?? 0,
    });

    await prisma.export.update({
      where: { id: exportRecord.id },
      data: { path: outputPath, durationSec, sizeBytes },
    });

    return NextResponse.json({ id: exportRecord.id, durationSec, sizeBytes });
  } catch (err) {
    await prisma.export.delete({ where: { id: exportRecord.id } }).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message.slice(0, 500) : "匯出失敗" },
      { status: 500 },
    );
  }
}
