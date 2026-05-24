"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Project = {
  id: string;
  title: string;
  status: "UPLOADED" | "TRANSCRIBING" | "READY" | "ERROR";
  durationSec: number | null;
  createdAt: string;
  errorMessage: string | null;
};

const STATUS_LABEL: Record<Project["status"], string> = {
  UPLOADED: "已上傳",
  TRANSCRIBING: "轉錄中…",
  READY: "可編輯",
  ERROR: "錯誤",
};

const STATUS_STYLE: Record<Project["status"], string> = {
  UPLOADED: "bg-zinc-700 text-zinc-200",
  TRANSCRIBING: "bg-amber-500/20 text-amber-300 animate-pulse",
  READY: "bg-emerald-500/20 text-emerald-300",
  ERROR: "bg-red-500/20 text-red-300",
};

function fmtDur(sec: number | null): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/projects");
    if (res.ok) {
      const data = await res.json();
      setProjects(data.projects);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000); // 持續刷新轉錄狀態
    return () => clearInterval(t);
  }, [load]);

  const upload = useCallback(
    (file: File) => {
      setError(null);
      setUploading(true);
      setProgress(0);
      const fd = new FormData();
      fd.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/projects");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        setUploading(false);
        if (xhr.status === 201) {
          const { id } = JSON.parse(xhr.responseText);
          router.push(`/projects/${id}`);
        } else {
          try {
            setError(JSON.parse(xhr.responseText).error ?? "上傳失敗");
          } catch {
            setError("上傳失敗");
          }
        }
      };
      xhr.onerror = () => {
        setUploading(false);
        setError("上傳失敗，請重試");
      };
      xhr.send(fd);
    },
    [router],
  );

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <section className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">把錄音變成可發布的 Podcast</h1>
        <p className="mt-2 text-zinc-400 max-w-2xl">
          上傳你的錄音檔，系統會自動產生逐字稿。接著像編輯文件一樣刪掉不要的段落（刪文字＝刪音訊），
          再一鍵套用降噪與廣播級響度，最後匯出 MP3 上傳到 Podcast 平台。
        </p>
      </section>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
        className={`block cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition ${
          dragOver
            ? "border-indigo-400 bg-indigo-500/10"
            : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/40"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
        {uploading ? (
          <div>
            <p className="text-zinc-300">上傳中… {progress}%</p>
            <div className="mx-auto mt-3 h-2 w-64 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-indigo-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div>
            <div className="text-4xl">⬆️</div>
            <p className="mt-3 font-medium">拖曳音檔到這裡，或點擊選擇檔案</p>
            <p className="mt-1 text-sm text-zinc-500">支援 MP3 / WAV / M4A / AAC 等，最大 500MB</p>
          </div>
        )}
      </label>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">我的專案</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-zinc-500">尚無專案，上傳第一個錄音檔開始吧。</p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/40">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <Link href={`/projects/${p.id}`} className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.title}</div>
                  <div className="text-xs text-zinc-500">
                    {new Date(p.createdAt).toLocaleString("zh-TW")} · {fmtDur(p.durationSec)}
                  </div>
                </Link>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[p.status]}`}
                >
                  {STATUS_LABEL[p.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
