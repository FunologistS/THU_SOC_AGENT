import { NextResponse } from "next/server";
import path from "node:path";
import { getRepoRoot, resolveUnder, safeReadFile } from "@/lib/pathSafety";
import { Document, Packer, Paragraph } from "docx";
import PDFDocument from "pdfkit";

/** 将 Markdown 简单降级为纯文本，保留链接文字与 URL，去掉粗体/标题标记等 */
function stripMarkdownToPlainText(markdown: string): string {
  let t = markdown.replace(/\r\n/g, "\n");
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text: string, url: string) => `${text} (${url})`);
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/^\s*[-*+]\s+/gm, "• ");
  t = t.replace(/^\s*\d+\.\s+/gm, (m) => m.replace(/\d+/, (d) => `${d}.`));
  return t;
}

async function markdownToDocxBuffer(markdown: string): Promise<Buffer> {
  const plain = stripMarkdownToPlainText(markdown);
  const paragraphs = plain
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => new Paragraph(block));

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs.length > 0 ? paragraphs : [new Paragraph(plain)],
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  return buf;
}

async function markdownToPdfBuffer(markdown: string): Promise<Buffer> {
  const plain = stripMarkdownToPlainText(markdown);
  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];

  return await new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", (err) => {
      reject(err);
    });

    doc.fontSize(12).text(plain || "", {
      align: "left",
    });
    doc.end();
  });
}

/** GET /api/file?source=mock|outputs&path=<topic>/stage/file.md&download=1&format=markdown|docx|pdf
 *  - 只读，防 path traversal
 *  - download=1 时以附件形式返回
 *  - format 控制导出格式（默认 markdown）
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") || "mock";
  const relativePath = searchParams.get("path");
  const download = searchParams.get("download") === "1";
  const format = (searchParams.get("format") || "markdown").toLowerCase();

  if (!relativePath || typeof relativePath !== "string") {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const repoRoot = getRepoRoot();
  const baseDir =
    source === "outputs"
      ? path.join(repoRoot, "outputs")
      : path.join(repoRoot, "ui", "mock");

  const resolved = resolveUnder(baseDir, relativePath);
  if (!resolved) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const content = safeReadFile(resolved, baseDir);
  if (content === null) {
    return NextResponse.json({ error: "File not found or unreadable" }, { status: 404 });
  }

  const originalName = path.basename(resolved);
  const baseName = originalName.replace(/\.md$/i, "") || "document";

  try {
    if (format === "docx" || format === "word") {
      const buf = await markdownToDocxBuffer(content);
      const fileName = `${baseName}.docx`;
      const headers: Record<string, string> = {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
      if (download) {
        const encoded = encodeURIComponent(fileName);
        headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encoded}`;
      }
      return new NextResponse(buf, { headers });
    }

    if (format === "pdf") {
      const buf = await markdownToPdfBuffer(content);
      const fileName = `${baseName}.pdf`;
      const headers: Record<string, string> = {
        "Content-Type": "application/pdf",
      };
      if (download) {
        const encoded = encodeURIComponent(fileName);
        headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encoded}`;
      }
      return new NextResponse(buf, { headers });
    }
  } catch (err) {
    return NextResponse.json({ error: "Failed to convert document" }, { status: 500 });
  }

  const fileName = originalName;
  const headers: Record<string, string> = {
    "Content-Type": "text/markdown; charset=utf-8",
  };
  if (download) {
    const encoded = encodeURIComponent(fileName);
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encoded}`;
  }

  return new NextResponse(content, { headers });
}
