import { prisma } from "@/lib/prisma";
import { transcribeFile } from "@/lib/s2t";
import { probeDurationSec } from "@/lib/audio";

/**
 * 背景轉錄：呼叫 8HD-4 的 S2T 服務，完成後寫回 Project.transcript 與狀態。
 * 以 fire-and-forget 方式從上傳路由觸發（pm2 常駐程序可安全執行）。
 */
export async function runTranscription(projectId: string): Promise<void> {
  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return;

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "TRANSCRIBING" },
    });

    const durationSec = await probeDurationSec(project.originalPath).catch(() => null);

    const transcript = await transcribeFile(project.originalPath);

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "READY",
        transcript: transcript as unknown as object,
        durationSec: durationSec ?? undefined,
      },
    });
  } catch (err) {
    await prisma.project
      .update({
        where: { id: projectId },
        data: {
          status: "ERROR",
          errorMessage: err instanceof Error ? err.message.slice(0, 500) : String(err),
        },
      })
      .catch(() => {});
  }
}
