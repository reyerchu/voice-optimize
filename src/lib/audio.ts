import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";

export type Segment = { start: number; end: number };

export type ProcessOptions = {
  /** FFT 降噪 + 高通濾波，去除底噪與低頻嗡聲 */
  denoise: boolean;
  /** EBU R128 響度正規化到 -16 LUFS（Podcast 標準） */
  loudnorm: boolean;
  /** 移除過長靜默（> ~0.8s） */
  trimSilence: boolean;
};

/** 執行 ffmpeg / ffprobe，回傳 stdout；非 0 結束則 reject 並帶 stderr */
function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${bin} exited ${code}: ${err.slice(-2000)}`));
    });
  });
}

/** 取得音檔長度（秒） */
export async function probeDurationSec(path: string): Promise<number> {
  const out = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    path,
  ]);
  const sec = parseFloat(out.trim());
  return Number.isFinite(sec) ? sec : 0;
}

/** 合併重疊/相鄰的時間區段，並過濾掉過短的片段 */
function normalizeSegments(segments: Segment[], totalDur: number): Segment[] {
  const cleaned = segments
    .map((s) => ({
      start: Math.max(0, s.start),
      end: Math.min(totalDur || s.end, s.end),
    }))
    .filter((s) => s.end - s.start > 0.02)
    .sort((a, b) => a.start - b.start);

  const merged: Segment[] = [];
  for (const s of cleaned) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end + 0.05) {
      last.end = Math.max(last.end, s.end);
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

/** 後處理濾鏡鏈（降噪 / 響度 / 去靜默），接在某個音訊標籤之後 */
function postFilters(opts: ProcessOptions): string[] {
  const f: string[] = [];
  if (opts.denoise) {
    f.push("highpass=f=80");
    f.push("afftdn=nf=-25");
  }
  if (opts.trimSilence) {
    // 移除長於 ~0.8s 的靜默，但保留 0.3s 讓語句之間有呼吸感
    f.push(
      "silenceremove=stop_periods=-1:stop_duration=0.3:stop_threshold=-38dB:detection=peak",
    );
  }
  if (opts.loudnorm) {
    f.push("loudnorm=I=-16:TP=-1.5:LRA=11");
  }
  return f;
}

/**
 * 依 keepSegments（要保留的時間範圍）剪輯並套用後處理，輸出 MP3。
 * keepSegments 為空時代表保留整段。
 */
export async function exportMp3(params: {
  inputPath: string;
  outputPath: string;
  keepSegments: Segment[];
  options: ProcessOptions;
  totalDurationSec: number;
}): Promise<{ durationSec: number; sizeBytes: number }> {
  const { inputPath, outputPath, options, totalDurationSec } = params;
  const keep = normalizeSegments(params.keepSegments, totalDurationSec);

  const post = postFilters(options);
  const keepsWholeFile =
    keep.length === 0 ||
    (keep.length === 1 && keep[0].start < 0.05 && keep[0].end >= totalDurationSec - 0.05);

  const args: string[] = ["-y", "-i", inputPath];

  if (keepsWholeFile) {
    // 不剪輯，只套用後處理（若無後處理則純轉檔）
    if (post.length > 0) {
      args.push("-af", post.join(","));
    }
  } else {
    // 逐段 atrim → concat → 後處理
    const labels: string[] = [];
    const parts: string[] = [];
    keep.forEach((s, i) => {
      parts.push(
        `[0:a]atrim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},asetpts=N/SR/TB[s${i}]`,
      );
      labels.push(`[s${i}]`);
    });
    let chain = `${parts.join(";")};${labels.join("")}concat=n=${keep.length}:v=0:a=1[ca]`;
    if (post.length > 0) {
      chain += `;[ca]${post.join(",")}[out]`;
      args.push("-filter_complex", chain, "-map", "[out]");
    } else {
      args.push("-filter_complex", chain, "-map", "[ca]");
    }
  }

  args.push("-c:a", "libmp3lame", "-q:a", "2", outputPath);

  await run("ffmpeg", args);

  const [durationSec, fileStat] = await Promise.all([
    probeDurationSec(outputPath),
    stat(outputPath),
  ]);
  return { durationSec, sizeBytes: fileStat.size };
}
