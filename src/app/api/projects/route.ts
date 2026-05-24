import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { getOrCreateSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { runTranscription } from "@/lib/transcribe";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "/home/reyerchu/voice-optimize/uploads";
const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 524288000);

/** 列出目前 session 的所有專案 */
export async function GET() {
  const session = await getOrCreateSession();
  const projects = await prisma.project.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      durationSec: true,
      createdAt: true,
      errorMessage: true,
    },
  });
  return NextResponse.json({ projects });
}

/** 上傳音檔 → 建立專案 → 背景觸發轉錄 */
export async function POST(request: NextRequest) {
  const session = await getOrCreateSession();

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少音檔" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "檔案為空" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `檔案過大（上限 ${Math.round(MAX_BYTES / 1024 / 1024)}MB）` },
      { status: 413 },
    );
  }

  const title = (form.get("title") as string)?.trim() || file.name.replace(/\.[^.]+$/, "");

  const project = await prisma.project.create({
    data: {
      sessionId: session.id,
      title,
      originalName: file.name,
      originalPath: "",
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      status: "UPLOADED",
    },
  });

  const dir = join(UPLOAD_DIR, project.id);
  await mkdir(dir, { recursive: true });
  const ext = extname(file.name) || ".bin";
  const dest = join(dir, `source${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(dest, buffer);

  await prisma.project.update({
    where: { id: project.id },
    data: { originalPath: dest },
  });

  // fire-and-forget 背景轉錄
  void runTranscription(project.id);

  return NextResponse.json({ id: project.id, status: "UPLOADED" }, { status: 201 });
}
