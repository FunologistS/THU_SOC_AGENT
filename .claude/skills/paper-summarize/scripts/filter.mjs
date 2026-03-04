#!/usr/bin/env node
/**
 * filter.mjs
 * Interactive filter for journal-search outputs.
 *
 * Input:  outputs/<topic>/01_raw/papers_<YYYYMMDD>_vN.md
 * Output: outputs/<topic>/02_clean/papers_clean_<YYYYMMDD>_vN.md + papers_clean_latest.md
 *
 * Usage:
 *   node filter.mjs artificial_intelligence
 *   node filter.mjs artificial_intelligence --in outputs/<topic>/01_raw/papers_20260221_v3.md
 *   node filter.mjs artificial_intelligence --no-interactive   # 无交互，用于管线：仅做主题/关键词相关性过滤，写 02_clean
 *   node filter.mjs artificial_intelligence --no-interactive --year-from 2023 --year-to 2025 --strong-keywords "digital labor"
 *
 * Fixes / improvements in this version:
 * 1) Robust table row splitting:
 *    - If a title/abstract contains "|" and breaks column count, we merge overflow back into the last column.
 * 2) Relevance gate strengthened:
 *    - Weak keywords: derived from topic (e.g., "artificial intelligence", "artificial", "intelligence")
 *    - Strong keywords: optional extra keywords; if provided, requires at least one strong hit (in title+abstract; if abstract empty, title only)
 *    - This reduces false positives where "intelligence" appears but is irrelevant.
 * 3) Cleaner I/O checks and clearer logging.
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

// ---- helpers ----
function exists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function parseArgs(argv) {
  const args = {
    topic: null,
    inPath: null,
    noInteractive: false,
    yearFrom: null,
    yearTo: null,
    strongKeywords: [],
  };
  const rest = argv.slice(2);

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!args.topic && !a.startsWith("--")) {
      args.topic = a;
      continue;
    }
    if (a === "--in") {
      args.inPath = rest[i + 1];
      i++;
      continue;
    }
    if (a === "--no-interactive" || a === "--batch") {
      args.noInteractive = true;
      continue;
    }
    if (a === "--year-from") {
      const v = Number(rest[i + 1]);
      if (Number.isInteger(v)) args.yearFrom = v;
      i++;
      continue;
    }
    if (a === "--year-to") {
      const v = Number(rest[i + 1]);
      if (Number.isInteger(v)) args.yearTo = v;
      i++;
      continue;
    }
    if (a === "--strong-keywords") {
      const raw = rest[i + 1] || "";
      args.strongKeywords = raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      i++;
      continue;
    }
  }
  return args;
}

function findLatestRawFile(rawDir) {
  if (!exists(rawDir)) return null;
  const latestPath = path.join(rawDir, "papers_latest.md");
  if (exists(latestPath)) return latestPath;
  const files = fs
    .readdirSync(rawDir)
    .filter((f) => /^papers_\d{8}_v\d+\.md$/i.test(f))
    .map((f) => ({
      name: f,
      full: path.join(rawDir, f),
      mtime: fs.statSync(path.join(rawDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  return files.length ? files[0].full : null;
}

function nextVersionedPath(cleanDir, baseNameNoExt) {
  // baseNameNoExt example: papers_clean_20260221
  ensureDir(cleanDir);
  const existing = fs
    .readdirSync(cleanDir)
    .filter((f) => new RegExp(`^${baseNameNoExt}_v\\d+\\.md$`, "i").test(f));

  let maxV = 0;
  for (const f of existing) {
    const m = f.match(/_v(\d+)\.md$/i);
    if (m) maxV = Math.max(maxV, Number(m[1]));
  }
  const v = maxV + 1;
  return path.join(cleanDir, `${baseNameNoExt}_v${v}.md`);
}

function extractYear(s) {
  if (!s) return null;
  const m = String(s).match(/(19\d{2}|20\d{2})/);
  return m ? Number(m[1]) : null;
}

// ---- markdown table parsing ----
function parseMarkdownTable(md) {
  const lines = md.split(/\r?\n/);

  // find the first markdown table header line that contains pipes
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("|") && lines[i].includes("|")) {
      // next line should be separator
      if (i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        headerIdx = i;
        break;
      }
    }
  }
  if (headerIdx === -1) {
    return { pre: lines, header: null, sep: null, rows: [], post: [] };
  }

  const pre = lines.slice(0, headerIdx);
  const header = lines[headerIdx];
  const sep = lines[headerIdx + 1];

  // data rows until a blank line or non-table line
  const rows = [];
  let endIdx = headerIdx + 2;
  for (; endIdx < lines.length; endIdx++) {
    const l = lines[endIdx];
    if (!l.trim().startsWith("|")) break;
    rows.push(l);
  }
  const post = lines.slice(endIdx);

  return { pre, header, sep, rows, post };
}

/**
 * Robust splitRow:
 * - Splits by "|"
 * - If expectedCols is provided and we have too many cells (because title/abstract includes "|"),
 *   merge overflow back into the last column.
 */
function splitRow(rowLine, expectedCols = null) {
  const core = rowLine.trim().replace(/^\|/, "").replace(/\|$/, "");
  let cells = core.split("|").map((c) => c.trim());

  if (expectedCols && Number.isInteger(expectedCols) && expectedCols >= 2) {
    if (cells.length > expectedCols) {
      const head = cells.slice(0, expectedCols - 1);
      const tail = cells.slice(expectedCols - 1).join(" | ");
      cells = [...head, tail];
    } else if (cells.length < expectedCols) {
      while (cells.length < expectedCols) cells.push("");
    }
  }

  return cells;
}

function joinRow(cells) {
  return `| ${cells.join(" | ")} |`;
}

/**
 * 从上游 01_raw 的文档头（table.pre）解析摘要补全信息，供 02_clean 表头展示。
 * 检索脚本会写入「摘要补全：是/否」和可选的「摘要补全条数：N」。
 */
function parseUpstreamAbstractCompletion(preLines) {
  let abstractCompletion = null; // "是" | "否"
  let abstractCompletionCount = null;
  const pre = (preLines || []).join("\n");
  const matchYesNo = pre.match(/\b摘要补全[：:]\s*([是否])/);
  if (matchYesNo) abstractCompletion = matchYesNo[1];
  const matchCount = pre.match(/\b摘要补全条数[：:]\s*(\d+)/);
  if (matchCount) abstractCompletionCount = parseInt(matchCount[1], 10);
  return { abstractCompletion, abstractCompletionCount };
}

/** 将 ISO 时间格式化为北京时间字符串（便于阅读） */
function formatBeijingTime(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return isoString || "";
  }
}

/**
 * 生成清洗规整结果的中文版文档头（与检索结果风格一致，便于用户阅读）。
 * @param {Object} opts
 * @param {string} opts.topic - 主题 slug
 * @param {string} opts.sourceRelative - 数据源相对路径，如 outputs/xxx/01_raw/papers_latest.md
 * @param {string} opts.filterDescChinese - 筛选方式中文描述
 * @param {number} opts.kept - 保留条数
 * @param {number} opts.dropped - 剔除条数
 * @param {string} opts.generatedIso - 生成时间 ISO 字符串
 * @param {string|null} opts.abstractCompletion - 上游摘要补全："是"|"否"|null
 * @param {number|null} opts.abstractCompletionCount - 上游摘要补全条数，可选
 */
function buildFilterHeaderChinese(opts) {
  const topicLabel = (opts.topic || "").replace(/_/g, " ");
  const lines = [
    `# 清洗规整结果 · 主题：${topicLabel}`,
    ``,
    `---`,
    ``,
    `### 📋 清洗条件`,
    ``,
    `- 数据源：${opts.sourceRelative}`,
    `- 筛选方式：${opts.filterDescChinese}`,
    `- 保留：${opts.kept} 条`,
    `- 剔除：${opts.dropped} 条`,
  ];
  if (opts.abstractCompletion !== undefined && opts.abstractCompletion !== null) {
    if (opts.abstractCompletion === "是" && opts.abstractCompletionCount != null && opts.abstractCompletionCount > 0) {
      lines.push(`- 摘要补全（上游）：是，本次新增 ${opts.abstractCompletionCount} 条`);
    } else if (opts.abstractCompletion === "是") {
      lines.push(`- 摘要补全（上游）：是`);
    } else {
      lines.push(`- 摘要补全（上游）：否`);
    }
  }
  lines.push(`- 生成时间：${formatBeijingTime(opts.generatedIso)}（北京时间）`);
  lines.push(``);
  lines.push(``);
  return lines.join("\n");
}

function findDateColumnIndex(headerLine, expectedCols) {
  const cells = splitRow(headerLine, expectedCols).map((c) => c.toLowerCase());
  const candidates = [
    "publication_date",
    "publication date",
    "pub_date",
    "pub date",
    "date",
    "year",
    "published",
  ];
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i];
    if (candidates.some((k) => h === k || h.includes(k))) return i;
  }
  return -1;
}

function applyYearFilter(table, mode, y1, y2, expectedCols) {
  if (!table.header) {
    return { kept: [], dropped: 0, reason: "No markdown table detected." };
  }
  const dateIdx = findDateColumnIndex(table.header, expectedCols);
  if (dateIdx < 0) {
    return {
      kept: [],
      dropped: table.rows.length,
      reason: "No date column detected in header.",
    };
  }

  const kept = [];
  let dropped = 0;

  for (const row of table.rows) {
    const cells = splitRow(row, expectedCols);
    const year = extractYear(cells[dateIdx]);
    if (year == null) {
      dropped++;
      continue;
    }

    let ok = true;
    if (mode === "before") ok = year < y1;
    if (mode === "after") ok = year > y1;
    if (mode === "between") ok = year >= y1 && year <= y2;

    if (ok) kept.push(joinRow(cells));
    else dropped++;
  }

  return { kept, dropped, reason: null };
}

// ---- relevance gate ----
function normalizeTopicToKeywords(topic) {
  const base = String(topic || "")
    .trim()
    .replace(/[_\s]+/g, " ")
    .toLowerCase();

  if (!base) return [];

  // include whole phrase + split parts (len >= 2)
  const parts = base.split(" ").filter((w) => w.length >= 2);
  return [...new Set([base, ...parts])];
}

/**
 * If extraKeys (strong) provided:
 *   require (weak hit) AND (strong hit) in (title+abstract, or title only if abstract empty)
 * Else:
 *   require (weak hit)
 */
function applyKeywordFilter(rows, weakKeys, strongKeys, titleIdx, abstractIdx, expectedCols) {
  const kept = [];
  let dropped_keyword_mismatch = 0;

  const hasStrong = Array.isArray(strongKeys) && strongKeys.length > 0;
  const weak = (weakKeys || []).map((s) => String(s || "").toLowerCase()).filter(Boolean);
  const strong = (strongKeys || []).map((s) => String(s || "").toLowerCase()).filter(Boolean);

  for (const row of rows) {
    const cells = splitRow(row, expectedCols);

    const title = (cells[titleIdx] || "").toLowerCase();
    const absRaw = cells[abstractIdx] || "";
    const abs = absRaw.toLowerCase();

    // If abstract empty, only use title to avoid false deletions.
    const hay = absRaw.trim() ? `${title}\n${abs}` : title;

    const weakHit = weak.length ? weak.some((k) => k && hay.includes(k)) : true;
    const strongHit = hasStrong ? strong.some((k) => k && hay.includes(k)) : true;

    const ok = weakHit && strongHit;
    if (ok) kept.push(joinRow(cells));
    else dropped_keyword_mismatch++;
  }

  return { kept, dropped_keyword_mismatch };
}

/**
 * Core filter logic: year filter + keyword relevance, write to 02_clean.
 * Returns { success, outPath, latestPath, kept, dropped } or { success: false, error }.
 */
function runFilterLogic({
  topic,
  inPath,
  mode,
  y1,
  y2,
  weakKeys,
  strongKeys,
  table,
  expectedCols,
  cleanDir,
}) {
  const yearRes = applyYearFilter(table, mode, y1, y2, expectedCols);
  if (yearRes.reason) {
    return { success: false, error: yearRes.reason };
  }

  let keptRows = yearRes.kept;
  let droppedTotal = yearRes.dropped;

  const headerCells = splitRow(table.header, expectedCols).map((c) => c.toLowerCase());
  const titleIdx = headerCells.findIndex((h) => h === "title" || h.includes("title"));
  const abstractIdx = headerCells.findIndex((h) => h === "abstract" || h.includes("abstract"));

  if (titleIdx >= 0 && abstractIdx >= 0 && (weakKeys?.length || strongKeys?.length)) {
    const kwRes = applyKeywordFilter(
      keptRows,
      weakKeys || [],
      strongKeys || [],
      titleIdx,
      abstractIdx,
      expectedCols
    );
    keptRows = kwRes.kept;
    droppedTotal += kwRes.dropped_keyword_mismatch;
  }

  ensureDir(cleanDir);
  const base = `papers_clean_${todayYYYYMMDD()}`;
  const outPath = nextVersionedPath(cleanDir, base);
  const latestPath = path.join(cleanDir, "papers_clean_latest.md");

  const filterDesc =
    mode === "before"
      ? `year < ${y1}`
      : mode === "after"
      ? `year > ${y1}`
      : mode === "between"
      ? `${y1}–${y2}`
      : "none";
  const filterDescChinese =
    mode === "before"
      ? `年份 < ${y1}`
      : mode === "after"
      ? `年份 > ${y1}`
      : mode === "between"
      ? `年份 ${y1}–${y2}`
      : "主题 + 强关键词相关性";

  const { abstractCompletion, abstractCompletionCount } = parseUpstreamAbstractCompletion(table.pre);
  const headerNote = buildFilterHeaderChinese({
    topic,
    sourceRelative: path.relative(process.cwd(), inPath),
    filterDescChinese,
    kept: keptRows.length,
    dropped: droppedTotal,
    generatedIso: new Date().toISOString(),
    abstractCompletion,
    abstractCompletionCount,
  });

  const outLines = [
    ...table.pre,
    ...(table.pre.length ? [""] : []),
    headerNote,
    table.header,
    table.sep,
    ...keptRows,
    ...table.post,
  ].join("\n");

  fs.writeFileSync(outPath, outLines, "utf-8");
  fs.writeFileSync(latestPath, outLines, "utf-8");

  return { success: true, outPath, latestPath, kept: keptRows.length, dropped: droppedTotal };
}

// ---- main ----
async function main() {
  const args = parseArgs(process.argv);

  const outputsDir = path.resolve(process.cwd(), "outputs");

  // ---- No-interactive (batch) mode: for pipeline / UI ----
  if (args.noInteractive) {
    const topic = args.topic?.trim();
    if (!topic) {
      console.error("ERROR: topic is required (e.g. filter.mjs <topic> --no-interactive).");
      process.exit(1);
    }

    const topicDir = path.join(outputsDir, topic);
    const rawDir = path.join(topicDir, "01_raw");
    const cleanDir = path.join(topicDir, "02_clean");

    let inPath = args.inPath ? path.resolve(process.cwd(), args.inPath) : null;
    if (!inPath) inPath = findLatestRawFile(rawDir);

    if (!inPath || !exists(inPath)) {
      console.error(`ERROR: input file not found. Checked: ${inPath || rawDir}`);
      process.exit(1);
    }

    const expectedRawPrefix = path.join(outputsDir, topic, "01_raw") + path.sep;
    if (!path.resolve(inPath).startsWith(expectedRawPrefix)) {
      console.error("ERROR: topic mismatch between <topic> and --in input path.");
      process.exit(1);
    }

    const md = fs.readFileSync(inPath, "utf-8");
    const table = parseMarkdownTable(md);
    if (!table.header) {
      console.error("ERROR: No markdown table detected in input.");
      process.exit(1);
    }

    const expectedCols = splitRow(table.header).length;
    let mode = "none";
    let y1 = 1900;
    let y2 = 2100;
    if (args.yearFrom != null && args.yearTo != null) {
      mode = "between";
      y1 = Math.min(args.yearFrom, args.yearTo);
      y2 = Math.max(args.yearFrom, args.yearTo);
    } else if (args.yearFrom != null) {
      mode = "after";
      y1 = args.yearFrom;
    } else if (args.yearTo != null) {
      mode = "before";
      y1 = args.yearTo;
    }

    const weakKeys = normalizeTopicToKeywords(topic);
    const strongKeys = args.strongKeywords || [];

    if (mode === "none") {
      // No year filter: keep all rows, apply only relevance (topic + strong keywords)
      const allRows = table.rows.map((r) => joinRow(splitRow(r, expectedCols)));
      const headerCells = splitRow(table.header, expectedCols).map((c) => c.toLowerCase());
      const titleIdx = headerCells.findIndex((h) => h === "title" || h.includes("title"));
      const abstractIdx = headerCells.findIndex((h) => h === "abstract" || h.includes("abstract"));
      let keptRows = allRows;
      let droppedTotal = 0;
      if (titleIdx >= 0 && abstractIdx >= 0 && (weakKeys.length || strongKeys.length)) {
        const kwRes = applyKeywordFilter(
          keptRows,
          weakKeys,
          strongKeys,
          titleIdx,
          abstractIdx,
          expectedCols
        );
        keptRows = kwRes.kept;
        droppedTotal = allRows.length - keptRows.length;
      }
      ensureDir(cleanDir);
      const base = `papers_clean_${todayYYYYMMDD()}`;
      const outPath = nextVersionedPath(cleanDir, base);
      const latestPath = path.join(cleanDir, "papers_clean_latest.md");
      const { abstractCompletion, abstractCompletionCount } = parseUpstreamAbstractCompletion(table.pre);
      const headerNote = buildFilterHeaderChinese({
        topic,
        sourceRelative: path.relative(process.cwd(), inPath),
        filterDescChinese: "主题 + 强关键词相关性",
        kept: keptRows.length,
        dropped: droppedTotal,
        generatedIso: new Date().toISOString(),
        abstractCompletion,
        abstractCompletionCount,
      });
      const outLines = [
        ...table.pre,
        ...(table.pre.length ? [""] : []),
        headerNote,
        table.header,
        table.sep,
        ...keptRows,
        ...table.post,
      ].join("\n");
      fs.writeFileSync(outPath, outLines, "utf-8");
      fs.writeFileSync(latestPath, outLines, "utf-8");
      console.log("[filter] Done (batch). Kept:", keptRows.length, "Dropped:", droppedTotal);
      console.log("  Latest:", latestPath);
      return;
    }

    const result = runFilterLogic({
      topic,
      inPath,
      mode,
      y1,
      y2,
      weakKeys,
      strongKeys,
      table,
      expectedCols,
      cleanDir,
    });

    if (!result.success) {
      console.error("ERROR:", result.error);
      process.exit(1);
    }
    console.log("[filter] Done (batch). Kept:", result.kept, "Dropped:", result.dropped);
    console.log("  Latest:", result.latestPath);
    return;
  }

  // ---- Interactive mode ----
  const rl = readline.createInterface({ input, output });

  try {
    const topic =
      args.topic ||
      (await rl.question("Topic (e.g., artificial_intelligence): ")).trim();

    if (!topic) {
      console.error("ERROR: topic is required.");
      process.exitCode = 1;
      return;
    }

    const topicDir = path.join(outputsDir, topic);
    const rawDir = path.join(topicDir, "01_raw");
    const cleanDir = path.join(topicDir, "02_clean");

    let inPath = args.inPath ? path.resolve(process.cwd(), args.inPath) : null;
    if (!inPath) inPath = findLatestRawFile(rawDir);

    if (!inPath || !exists(inPath)) {
      console.error(`ERROR: input file not found. Checked: ${inPath || rawDir}`);
      process.exitCode = 1;
      return;
    }

    console.log("\n[filter] Input:", inPath);

    const expectedRawPrefix = path.join(outputsDir, topic, "01_raw") + path.sep;
    const resolvedIn = path.resolve(inPath);

    if (!resolvedIn.startsWith(expectedRawPrefix)) {
      console.error("ERROR: topic mismatch between <topic> and --in input path.");
      console.error("  topic:", topic);
      console.error("  expected input under:", expectedRawPrefix);
      console.error("  got inPath:", resolvedIn);
      process.exitCode = 1;
      return;
    }

    console.log("\nChoose time filter mode:");
    console.log("  1) Earlier than a year (year < X)");
    console.log("  2) Later than a year   (year > X)");
    console.log("  3) Between years (X <= year <= Y)");

    const modeChoice = (await rl.question("Enter 1/2/3: ")).trim();
    let mode = null;
    if (modeChoice === "1") mode = "before";
    if (modeChoice === "2") mode = "after";
    if (modeChoice === "3") mode = "between";
    if (!mode) {
      console.error("ERROR: invalid choice.");
      process.exitCode = 1;
      return;
    }

    const y1s = (await rl.question("Enter year X (e.g., 2020): ")).trim();
    const y1 = Number(y1s);
    if (!Number.isInteger(y1) || y1 < 1900 || y1 > 2100) {
      console.error("ERROR: invalid year X.");
      process.exitCode = 1;
      return;
    }

    let y2 = null;
    if (mode === "between") {
      const y2s = (await rl.question("Enter year Y (>= X): ")).trim();
      y2 = Number(y2s);
      if (!Number.isInteger(y2) || y2 < y1 || y2 > 2100) {
        console.error("ERROR: invalid year Y.");
        process.exitCode = 1;
        return;
      }
    }

    const md = fs.readFileSync(inPath, "utf-8");
    const table = parseMarkdownTable(md);

    if (!table.header) {
      console.error("ERROR: No markdown table detected in input.");
      process.exitCode = 1;
      return;
    }

    const expectedCols = splitRow(table.header).length;

    const yearRes = applyYearFilter(table, mode, y1, y2, expectedCols);
    if (yearRes.reason) {
      console.error("ERROR:", yearRes.reason);
      process.exitCode = 1;
      return;
    }

    let weakKeys = [];
    let strongKeys = [];
    const useGate = (await rl
      .question("Enable topic relevance gate (title+abstract keywords)? (Y/n) [default=Y]: "))
      .trim()
      .toLowerCase();

    if (useGate && useGate !== "n" && useGate !== "no") {
      const headerCells = splitRow(table.header, expectedCols).map((c) => c.toLowerCase());
      const titleIdx = headerCells.findIndex((h) => h === "title" || h.includes("title"));
      const abstractIdx = headerCells.findIndex((h) => h === "abstract" || h.includes("abstract"));

      if (titleIdx >= 0 && abstractIdx >= 0) {
        weakKeys = normalizeTopicToKeywords(topic);
        console.log("[filter] Weak keywords (from topic):", weakKeys.join(", "));

        const extra = (await rl.question(
          "Strong keywords (comma-separated, optional; if provided, requires at least one strong hit): "
        )).trim();

        strongKeys = extra
          ? extra.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
          : [];

        if (strongKeys.length) {
          console.log("[filter] Strong keywords:", strongKeys.join(", "));
        }
      }
    }

    const result = runFilterLogic({
      topic,
      inPath,
      mode,
      y1,
      y2: y2 ?? y1,
      weakKeys,
      strongKeys,
      table,
      expectedCols,
      cleanDir,
    });

    if (!result.success) {
      console.error("ERROR:", result.error);
      process.exitCode = 1;
      return;
    }

    console.log("\n[filter] Done.");
    console.log("  Output:", result.outPath);
    console.log("  Latest:", result.latestPath);
    console.log(`  Kept: ${result.kept}, Dropped: ${result.dropped}\n`);
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exitCode = 1;
});