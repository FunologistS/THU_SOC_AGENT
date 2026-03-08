import { NextResponse } from "next/server";
import path from "node:path";
import { getRepoRoot, resolveUnder, safeReadFile } from "@/lib/pathSafety";
import { Document, Packer, Paragraph, Table, TableRow, TableCell } from "docx";
import PDFDocument from "pdfkit";

/** 确保在 Node 环境运行（docx/pdfkit 依赖 Node Buffer、stream） */
export const runtime = "nodejs";

/** 仅保留 PDF 默认字体可渲染的字符；中文等会变为空格（若需中文请注册字体） */
function pdfSafeText(s: string): string {
  return s.replace(/[^\x00-\xFF]/g, " ");
}

/** 单元格内 Markdown 转为纯文本：链接保留为 text (url)，去掉粗体等 */
function cellMarkdownToPlain(s: string): string {
  let t = String(s ?? "")
    .replace(/\r?\n/g, " ")
    .trim();
  t = t.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_, text: string, url: string) => `${text || url} (${url})`);
  t = t.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1");
  t = t.replace(/`([^`]+)`/g, "$1");
  return t;
}

/** 从 Markdown 表格中移除 OpenAlex 列（与前端展示一致） */
function removeOpenAlexColumnFromTables(content: string): string {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim().startsWith("|")) {
      out.push(line);
      i++;
      continue;
    }
    const tableLines: string[] = [];
    while (i < lines.length && lines[i]!.trim().startsWith("|")) {
      tableLines.push(lines[i]!);
      i++;
    }
    if (tableLines.length < 2) {
      out.push(...tableLines);
      continue;
    }
    const parseRow = (row: string): string[] => {
      const parts = row.split("|").map((s) => s.trim());
      if (parts[0] === "" && parts.length > 1) return parts.slice(1, -1);
      return parts.filter((_, idx) => idx > 0 || parts[0] !== "");
    };
    const headerCells = parseRow(tableLines[0]!);
    const openAlexIdx = headerCells.findIndex((c) => /openalex/i.test(c));
    if (openAlexIdx === -1) {
      out.push(...tableLines);
      continue;
    }
    const writeRow = (cells: string[]): string => "| " + cells.join(" | ") + " |";
    for (const row of tableLines) {
      const cells = parseRow(row);
      if (cells.length > openAlexIdx) {
        const removed = cells.slice(0, openAlexIdx).concat(cells.slice(openAlexIdx + 1));
        out.push(writeRow(removed));
      } else {
        out.push(row);
      }
    }
  }
  return out.join("\n");
}

type ContentBlock = { type: "paragraph"; text: string } | { type: "table"; rows: string[][] };

/** 将 Markdown 解析为段落与表格块（表格为二维数组） */
function parseMarkdownToBlocks(markdown: string): ContentBlock[] {
  const normalized = removeOpenAlexColumnFromTables(markdown.replace(/\r\n/g, "\n"));
  const lines = normalized.split("\n");
  const blocks: ContentBlock[] = [];
  let i = 0;

  const parseTableRow = (row: string): string[] => {
    const parts = row.split("|").map((s) => s.trim());
    if (parts[0] === "" && parts.length > 1) return parts.slice(1, -1);
    return parts.filter((_, idx) => idx > 0 || parts[0] !== "");
  };

  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim().startsWith("|")) {
      const paraLines: string[] = [];
      while (i < lines.length && !lines[i]!.trim().startsWith("|")) {
        paraLines.push(lines[i]!);
        i++;
      }
      const text = paraLines
        .join("\n")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text: string, url: string) => `${text} (${url})`)
        .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/^\s*[-*+]\s+/gm, "• ")
        .trim();
      if (text.length > 0) blocks.push({ type: "paragraph", text });
      continue;
    }
    const tableLines: string[] = [];
    while (i < lines.length && lines[i]!.trim().startsWith("|")) {
      tableLines.push(lines[i]!);
      i++;
    }
    if (tableLines.length < 2) continue;
    const rows: string[][] = [];
    for (let r = 0; r < tableLines.length; r++) {
      const raw = tableLines[r]!;
      const cells = parseTableRow(raw);
      if (r === 1 && cells.every((c) => /^[-:]+$/.test(c))) continue;
      rows.push(cells.map((c) => cellMarkdownToPlain(c)));
    }
    if (rows.length > 0) blocks.push({ type: "table", rows });
  }
  return blocks;
}

async function markdownToDocxBuffer(markdown: string): Promise<Buffer> {
  const blocks = parseMarkdownToBlocks(markdown);
  const sectionChildren: (Paragraph | Table)[] = [];

  for (const block of blocks) {
    if (block.type === "paragraph") {
      const lines = block.text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      for (const line of lines) {
        sectionChildren.push(new Paragraph({ text: line }));
      }
      continue;
    }
    const { rows } = block;
    const docxRows = rows.map(
      (cells) =>
        new TableRow({
          children: cells.map(
            (cell) =>
              new TableCell({
                children: [new Paragraph({ text: cell })],
              })
          ),
        })
    );
    sectionChildren.push(new Table({ rows: docxRows }));
  }

  if (sectionChildren.length === 0) {
    sectionChildren.push(new Paragraph({ text: markdown.replace(/\r\n/g, "\n").trim() || " " }));
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: sectionChildren,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

async function markdownToPdfBuffer(markdown: string): Promise<Buffer> {
  const blocks = parseMarkdownToBlocks(markdown);
  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];

  return await new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = 50;
    const pageW = doc.page.width - 100;
    const lineHeight = 14;
    const tablePadding = 4;

    for (const block of blocks) {
      if (block.type === "paragraph") {
        const safe = pdfSafeText(block.text).trim() || " ";
        doc.fontSize(12).text(safe, 50, y, { width: pageW, align: "left" });
        y = doc.y + lineHeight;
        if (y > doc.page.height - 60) {
          doc.addPage();
          y = 50;
        }
        continue;
      }
      const { rows } = block;
      if (rows.length === 0) continue;
      const colCount = Math.max(...rows.map((r) => r.length));
      const colWidth = pageW / colCount;
      const cellHeight = lineHeight + tablePadding * 2;
      for (let r = 0; r < rows.length; r++) {
        if (y + cellHeight > doc.page.height - 60) {
          doc.addPage();
          y = 50;
        }
        const cells = rows[r]!;
        let maxH = cellHeight;
        for (let c = 0; c < colCount; c++) {
          const text = pdfSafeText(cells[c] ?? "").trim() || " ";
          const x = 50 + c * colWidth + tablePadding;
          const w = colWidth - tablePadding * 2;
          const h = doc.heightOfString(text, { width: w }) + tablePadding * 2;
          if (h > maxH) maxH = h;
        }
        for (let c = 0; c < colCount; c++) {
          const text = pdfSafeText(cells[c] ?? "").trim() || " ";
          const x = 50 + c * colWidth + tablePadding;
          const w = colWidth - tablePadding * 2;
          doc.rect(50 + c * colWidth, y, colWidth, maxH).stroke();
          doc.fontSize(10).text(text, x, y + tablePadding, { width: w, align: "left" });
        }
        y += maxH;
      }
      y += lineHeight;
    }

    doc.end();
  });
}

/** GET /api/file?source=mock|outputs&path=<topic>/stage/file.md&download=1&format=markdown|docx|pdf
 *  - 只读，防 path traversal
 *  - download=1 时以附件形式返回
 *  - format 控制导出格式（默认 markdown）；docx/pdf 会按表格方式导出，且与前端一致移除 OpenAlex 列
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
      return new NextResponse(new Uint8Array(buf), { headers });
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
      return new NextResponse(new Uint8Array(buf), { headers });
    }
  } catch (err) {
    console.error("[api/file] docx/pdf conversion failed:", err);
    const message = err instanceof Error ? err.message : "Failed to convert document";
    return NextResponse.json({ error: "Failed to convert document", detail: message }, { status: 500 });
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
