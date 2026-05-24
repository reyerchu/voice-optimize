"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type Segment = { start: number; end: number; text: string };
type Transcript = { language: string; segments: Segment[] };
type ExportItem = { id: string; durationSec: number; sizeBytes: number; createdAt: string };

type ProjectData = {
  id: string;
  title: string;
  status: "UPLOADED" | "TRANSCRIBING" | "READY" | "ERROR";
  durationSec: number | null;
  errorMessage: string | null;
  transcript: Transcript | null;
  exports: ExportItem[];
};

const FILLERS = ["嗯", "呃", "啊", "那個", "就是", "然後那個", "uh", "um", "uhh", "you know"];

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtBytes(b: number): string {
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;
}

export default function Editor({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProjectData | null>(null);
  const [kept, setKept] = useState<boolean[]>([]);
  const [opts, setOpts] = useState({ denoise: true, loudnorm: true, trimSilence: false });
  const [activeIdx, setActiveIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [exports, setExports] = useState<ExportItem[]>([]);

  const waveRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<{ destroy: () => void; setTime: (t: number) => void; playPause: () => void; play: () => void; pause: () => void; isPlaying: () => boolean } | null>(null);

  const loadProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}`);
    if (!res.ok) return null;
    const d: ProjectData = await res.json();
    return d;
  }, [projectId]);

  // 初次載入 + 轉錄中輪詢
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const d = await loadProject();
      if (stop || !d) return;
      setData(d);
      setExports(d.exports);
      if (d.transcript && kept.length === 0) {
        setKept(new Array(d.transcript.segments.length).fill(true));
      }
      if (d.status === "TRANSCRIBING" || d.status === "UPLOADED") {
        timer = setTimeout(tick, 3000);
      }
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadProject]);

  // 初始化 wavesurfer（READY 後）
  useEffect(() => {
    if (data?.status !== "READY" || !waveRef.current) return;
    let cancelled = false;
    (async () => {
      const { default: WaveSurfer } = await import("wavesurfer.js");
      if (cancelled || !waveRef.current) return;
      const ws = WaveSurfer.create({
        container: waveRef.current,
        url: `/api/projects/${projectId}/audio`,
        waveColor: "#52525b",
        progressColor: "#6366f1",
        cursorColor: "#a5b4fc",
        height: 80,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
      });
      wsRef.current = ws as unknown as typeof wsRef.current;
      ws.on("timeupdate", (t: number) => {
        const segs = data.transcript?.segments ?? [];
        const i = segs.findIndex((s) => t >= s.start && t < s.end);
        setActiveIdx(i);
      });
      ws.on("play", () => setPlaying(true));
      ws.on("pause", () => setPlaying(false));
      ws.on("finish", () => setPlaying(false));
    })();
    return () => {
      cancelled = true;
      wsRef.current?.destroy();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.status, projectId]);

  const segments = data?.transcript?.segments ?? [];

  const keptDuration = useMemo(
    () => segments.reduce((acc, s, i) => (kept[i] ? acc + (s.end - s.start) : acc), 0),
    [segments, kept],
  );
  const keptCount = kept.filter(Boolean).length;

  const seekTo = (i: number) => {
    const s = segments[i];
    if (!s || !wsRef.current || !data?.durationSec) return;
    wsRef.current.setTime(s.start);
    wsRef.current.play();
  };

  const toggleCut = (i: number) => {
    setKept((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  };

  const setAll = (v: boolean) => setKept(segments.map(() => v));

  const markFillers = () => {
    setKept(
      segments.map((s) => {
        const t = s.text.trim().toLowerCase();
        if (!t) return false; // 空白段落也剪掉
        const isFiller = FILLERS.some((f) => t === f || t === f + "。" || t === f + "，");
        return !(isFiller || t.length <= 1);
      }),
    );
  };

  const doExport = async () => {
    setExporting(true);
    setExportErr(null);
    const keepSegments = segments.filter((_, i) => kept[i]).map((s) => ({ start: s.start, end: s.end }));
    const res = await fetch(`/api/projects/${projectId}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepSegments, options: opts }),
    });
    setExporting(false);
    if (res.ok) {
      const e = await res.json();
      setExports((prev) => [
        { id: e.id, durationSec: e.durationSec, sizeBytes: e.sizeBytes, createdAt: new Date().toISOString() },
        ...prev,
      ]);
    } else {
      const e = await res.json().catch(() => ({}));
      setExportErr(e.error ?? "匯出失敗");
    }
  };

  if (!data) {
    return <div className="mx-auto max-w-5xl px-5 py-20 text-center text-zinc-400">載入中…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← 返回
        </Link>
        <h1 className="truncate text-2xl font-bold">{data.title}</h1>
      </div>

      {(data.status === "UPLOADED" || data.status === "TRANSCRIBING") && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-10 text-center">
          <div className="mb-2 text-3xl">📝</div>
          <p className="text-amber-200">正在產生逐字稿，請稍候…</p>
          <p className="mt-1 text-sm text-amber-200/60">較長的錄音需要數分鐘，此頁會自動更新。</p>
        </div>
      )}

      {data.status === "ERROR" && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-6 text-red-200">
          <p className="font-medium">轉錄失敗</p>
          <p className="mt-1 text-sm text-red-200/70">{data.errorMessage}</p>
        </div>
      )}

      {data.status === "READY" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* 左：波形 + 逐字稿 */}
          <div className="min-w-0">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div ref={waveRef} />
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => wsRef.current?.playPause()}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium hover:bg-indigo-500"
                >
                  {playing ? "⏸ 暫停" : "▶ 播放"}
                </button>
                <span className="text-sm text-zinc-400">
                  原長 {fmtTime(data.durationSec ?? 0)} · 保留 {keptCount}/{segments.length} 段 ≈{" "}
                  <span className="text-emerald-300">{fmtTime(keptDuration)}</span>
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <button onClick={() => setAll(true)} className="rounded-md bg-zinc-800 px-3 py-1 hover:bg-zinc-700">
                全部保留
              </button>
              <button onClick={() => setAll(false)} className="rounded-md bg-zinc-800 px-3 py-1 hover:bg-zinc-700">
                全部剪掉
              </button>
              <button onClick={markFillers} className="rounded-md bg-zinc-800 px-3 py-1 hover:bg-zinc-700">
                自動標記贅字／空段
              </button>
              <span className="text-zinc-500">點文字試聽，點 ✂ 剪掉該段</span>
            </div>

            <div className="mt-3 max-h-[55vh] space-y-1 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-2">
              {segments.map((s, i) => {
                const isKept = kept[i];
                const isActive = i === activeIdx;
                return (
                  <div
                    key={i}
                    className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${
                      isActive ? "bg-indigo-500/15" : ""
                    }`}
                  >
                    <button
                      onClick={() => toggleCut(i)}
                      title={isKept ? "剪掉這段" : "復原這段"}
                      className={`mt-0.5 shrink-0 rounded px-1.5 text-xs ${
                        isKept ? "text-zinc-500 hover:text-red-400" : "text-red-400"
                      }`}
                    >
                      {isKept ? "✂" : "↩"}
                    </button>
                    <span className="mt-0.5 w-12 shrink-0 text-right font-mono text-xs text-zinc-500">
                      {fmtTime(s.start)}
                    </span>
                    <button
                      onClick={() => seekTo(i)}
                      className={`flex-1 text-left text-sm leading-relaxed ${
                        isKept ? "text-zinc-100" : "text-zinc-600 line-through"
                      }`}
                    >
                      {s.text || <span className="italic text-zinc-600">（無語音）</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 右：處理選項 + 匯出 + show notes */}
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <h3 className="mb-3 font-semibold">音訊處理</h3>
              {[
                { k: "denoise", label: "降噪 + 去低頻嗡聲", desc: "FFT 降噪、80Hz 高通" },
                { k: "loudnorm", label: "響度正規化", desc: "EBU R128 -16 LUFS 廣播級" },
                { k: "trimSilence", label: "移除過長靜默", desc: "剪掉 >0.8s 的空白停頓" },
              ].map((o) => (
                <label key={o.k} className="mb-2 flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 accent-indigo-500"
                    checked={opts[o.k as keyof typeof opts]}
                    onChange={(e) => setOpts((p) => ({ ...p, [o.k]: e.target.checked }))}
                  />
                  <span>
                    <span className="block text-sm">{o.label}</span>
                    <span className="block text-xs text-zinc-500">{o.desc}</span>
                  </span>
                </label>
              ))}

              <button
                onClick={doExport}
                disabled={exporting || keptCount === 0}
                className="mt-2 w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exporting ? "處理中…（請稍候）" : "🎧 匯出 MP3"}
              </button>
              {keptCount === 0 && <p className="mt-2 text-xs text-amber-400">至少要保留一段才能匯出</p>}
              {exportErr && <p className="mt-2 text-xs text-red-400">{exportErr}</p>}
            </div>

            {exports.length > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <h3 className="mb-3 font-semibold">已匯出</h3>
                <ul className="space-y-2">
                  {exports.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-zinc-400">
                        {fmtTime(e.durationSec)} · {fmtBytes(e.sizeBytes)}
                      </span>
                      <a
                        href={`/api/exports/${e.id}/download`}
                        className="rounded-md bg-indigo-600 px-3 py-1 text-xs hover:bg-indigo-500"
                      >
                        下載
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
