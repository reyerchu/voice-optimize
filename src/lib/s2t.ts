import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

export type Transcript = {
  language: string;
  segments: TranscriptSegment[];
};

export async function transcribeFile(filePath: string): Promise<Transcript> {
  const s2tUrl = process.env.S2T_URL ?? "http://192.168.1.120:8002";
  const url = `${s2tUrl}/transcribe`;

  const fileStat = await stat(filePath);
  const fileName = basename(filePath);

  // Stream the file as multipart/form-data via Web Fetch using a Blob proxy.
  const stream = createReadStream(filePath);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const blob = new Blob([Buffer.concat(chunks)], { type: "audio/mpeg" });

  const fd = new FormData();
  fd.append("file", blob, fileName);

  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`s2t failed ${res.status}: ${txt.slice(0, 500)}`);
  }
  const body = (await res.json()) as { data: { json: string } };
  const parsed = JSON.parse(body.data.json) as {
    text: string;
    language: string;
    segments: { start: number; end: number; text: string }[];
  };
  return {
    language: parsed.language,
    segments: parsed.segments.map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    })),
  };
}
