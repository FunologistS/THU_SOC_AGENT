"use client";

import { useState, useEffect } from "react";
import type { PaperDetail } from "@/components/MarkdownPreview";

export type RefFormat = "apa" | "chicago" | "sociological_research";

function formatAPA(p: PaperDetail): string {
  const authors = (p.authors ?? "").trim() || "Unknown";
  const year = p.year != null ? String(p.year) : "n.d.";
  const title = (p.title ?? "").trim() || "（无标题）";
  const journal = (p.journal ?? "").trim() || "";
  const doi = (p.doi ?? "").trim();
  const openalex = (p.openalex ?? "").trim();
  const url = doi
    ? (doi.startsWith("http") ? doi : `https://doi.org/${doi}`)
    : openalex || "";
  const tail = url ? ` ${url}` : "";
  return `${authors} (${year}). ${title}.${journal ? ` *${journal}*.` : ""}${tail}`;
}

function formatChicago(p: PaperDetail): string {
  const authors = (p.authors ?? "").trim() || "Unknown";
  const year = p.year != null ? String(p.year) : "n.d.";
  const title = (p.title ?? "").trim() || "（无标题）";
  const journal = (p.journal ?? "").trim() || "";
  const doi = (p.doi ?? "").trim();
  const openalex = (p.openalex ?? "").trim();
  const url = doi
    ? (doi.startsWith("http") ? doi : `https://doi.org/${doi}`)
    : openalex || "";
  const tail = url ? ` ${url}` : "";
  return `${authors}. "${title}"${journal ? `. *${journal}*` : ""} (${year}).${tail}`;
}

/** 将 "FirstName Surname" 转为 "Surname, FirstName" */
function toSurnameFirst(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return name.trim();
  const surname = words[words.length - 1]!;
  const given = words.slice(0, -1).join(" ");
  return `${surname}, ${given}`;
}

/**
 * 《社会学研究》格式（参考样例）：
 * Ritzer, George & Nathan Jurgenson. 2010. "Title." Journal of Consumer Culture 10(1): 13-36.
 * Zhao, Yizhang, Tianyu Qiao, ... & Weidong Wang. 2025. "Title." Nature Human Behaviour (Published Online).
 * 规则：第一作者姓前名后，其余作者名前姓后；最后一位作者前用 &；期刊名斜体。
 */
function formatAuthorsSociologicalResearch(raw: string): string {
  const s = raw.trim() || "Unknown";
  if (!s) return "Unknown";
  const byAmp = s.split(/\s*&\s*/).map((t) => t.trim()).filter(Boolean);
  const firstBlock = byAmp[0] ?? "";
  const restBlocks = byAmp.slice(1);
  const firstTokens = firstBlock.split(/\s*,\s*/).map((t) => t.trim()).filter(Boolean);
  let firstAuthor: string;
  let restAuthors: string[];
  if (firstTokens.length >= 2 && !firstTokens[0]!.includes(" ")) {
    firstAuthor = `${firstTokens[0]}, ${firstTokens[1]}`;
    restAuthors = firstTokens.slice(2);
  } else if (firstTokens.length >= 1 && firstTokens[0]!.includes(" ")) {
    firstAuthor = toSurnameFirst(firstTokens[0]!);
    restAuthors = firstTokens.slice(1);
  } else if (firstTokens.length >= 1) {
    firstAuthor = firstTokens[0]!;
    restAuthors = firstTokens.slice(1);
  } else {
    firstAuthor = "";
    restAuthors = [];
  }
  const lastAuthor = restBlocks[restBlocks.length - 1];
  const allAuthors: string[] = [firstAuthor, ...restAuthors];
  if (lastAuthor) allAuthors.push(lastAuthor);
  if (allAuthors.length === 0) return s;
  if (allAuthors.length === 1) return firstAuthor || s;
  const last = allAuthors[allAuthors.length - 1]!;
  const beforeLast = allAuthors.slice(0, -1);
  return beforeLast.join(", ") + " & " + last;
}

function formatSociologicalResearch(p: PaperDetail): string {
  const authorsRaw = (p.authors ?? "").trim() || "Unknown";
  const year = p.year != null ? String(p.year) : "n.d.";
  const title = (p.title ?? "").trim() || "（无标题）";
  const journal = (p.journal ?? "").trim() || "";
  const doi = (p.doi ?? "").trim();
  const openalex = (p.openalex ?? "").trim();
  const url = doi
    ? (doi.startsWith("http") ? doi : `https://doi.org/${doi}`)
    : openalex || "";
  const tail = url ? ` ${url}` : "";
  const isLatin = /[a-zA-Z]/.test(authorsRaw) && /^[\x00-\x7F\s,&.\u00C0-\u024F]+$/.test(authorsRaw);
  if (isLatin) {
    const authors = formatAuthorsSociologicalResearch(authorsRaw);
    return `${authors}. ${year}. "${title}".${journal ? ` *${journal}*.` : "."}${tail}`;
  }
  return `${authorsRaw}，${year}，《${title}》${journal ? `，《${journal}》` : ""}。${tail}`;
}

function formatPaper(p: PaperDetail, format: RefFormat): string {
  switch (format) {
    case "apa":
      return formatAPA(p);
    case "chicago":
      return formatChicago(p);
    case "sociological_research":
      return formatSociologicalResearch(p);
    default:
      return formatAPA(p);
  }
}

const FORMAT_LABELS: { value: RefFormat; label: string }[] = [
  { value: "apa", label: "APA" },
  { value: "chicago", label: "Chicago" },
  { value: "sociological_research", label: "《社会学研究》" },
];

export function ReferencesBlock({ topic }: { topic: string }) {
  const [papers, setPapers] = useState<PaperDetail[]>([]);
  const [format, setFormat] = useState<RefFormat>("apa");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!topic) {
      setPapers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/papers-list?topic=${encodeURIComponent(topic)}`)
      .then((r) => {
        if (!r.ok) throw new Error("无法加载文献列表");
        return r.json();
      })
      .then((list) => (Array.isArray(list) ? list : []))
      .then(setPapers)
      .catch((e) => {
        setError(e?.message ?? "加载失败");
        setPapers([]);
      })
      .finally(() => setLoading(false));
  }, [topic]);

  if (loading) {
    return (
      <div className="mt-10 border-t border-[var(--border-soft)] pt-6">
        <p className="text-sm text-[var(--text-muted)]">正在加载参考文献…</p>
      </div>
    );
  }
  if (error || papers.length === 0) {
    return (
      <div className="mt-10 border-t border-[var(--border-soft)] pt-6">
        <p className="text-sm text-[var(--text-muted)]">
          {error ?? "暂无参考文献数据，请先完成「清洗规整」生成摘要列表。"}
        </p>
      </div>
    );
  }

  const refs = papers.map((p) => formatPaper(p, format));

  return (
    <div className="mt-10 border-t border-[var(--border-soft)] pt-6">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="prose-reader h2 text-lg font-semibold text-[var(--text)] m-0">
          参考文献
        </h2>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as RefFormat)}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--thu-purple)]"
          aria-label="参考文献格式"
        >
          {FORMAT_LABELS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <section
        className="references-list prose-reader text-sm text-[var(--text)]"
        aria-label="参考文献列表"
      >
        <ol className="list-decimal list-outside pl-6 space-y-2 [&_li]:pl-1">
          {refs.map((line, i) => (
            <li key={i} className="[&_a]:text-[var(--thu-purple)] [&_a]:underline">
              <span dangerouslySetInnerHTML={{ __html: escapeHtml(line) }} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** 转义 HTML，同时保留 *...* 为 <em>（斜体）、保留可识别的 URL 为链接 */
function escapeHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  // 将 *...* 转为 <em>
  const withEm = escaped.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // 将明显 URL 转为 <a>
  const withLinks = withEm.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return withLinks;
}
