import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import dns from "node:dns";
import { setTimeout as sleep } from "node:timers/promises";

// 让 Node 优先用 IPv4（对某些环境的 undici 解析/连接更稳）
try {
  dns.setDefaultResultOrder("ipv4first");
} catch { /* ignore */ }

function arg(name, def = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return def;
  return v;
}
function hasFlag(name) {
  return process.argv.includes(name);
}

function norm(s) {
  return (s ?? "").toString().trim();
}

// 把 00031224 / 0003-1224 / 0003 1224 统一成 0003-1224
function toIssnHyphen(s) {
  const t = norm(s).toUpperCase().replace(/[^0-9X]/g, "");
  if (t.length !== 8) return "";
  return `${t.slice(0, 4)}-${t.slice(4)}`;
}

function cleanUrl(u) {
  const t = norm(u);
  if (!t) return "";
  if (!/^https?:\/\//i.test(t)) return t;
  return t.replace(/\/+$/, "");
}

async function fetchJsonWithRetry(url, { retries = 4, baseDelayMs = 250 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "THU_SOC_AGENT/0.1 (OpenAlex; journal-catalog)",
          "Accept": "application/json",
        },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText} ${txt?.slice(0, 200) || ""}`.trim());
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      const isDnsOrNet =
        msg.includes("ENOTFOUND") ||
        msg.includes("EAI_AGAIN") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("fetch failed");

      if (!isDnsOrNet || attempt === retries) break;

      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[resolve_openalex_sources] WARN fetch failed (attempt ${attempt + 1}/${retries + 1}), retry in ${delay}ms: ${msg}`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

// 1) 用 ISSN 查 openalex source
async function resolveSourceByIssn(issnHyphen) {
  const url = new URL("https://api.openalex.org/sources");
  url.searchParams.set("filter", `issn:${issnHyphen}`);
  url.searchParams.set("per-page", "5");
  const data = await fetchJsonWithRetry(url.toString());
  return data?.results?.[0] || null;
}

// 2) 用 source id 获取更完整的信息（含 homepage_url）
async function fetchSourceById(sourceIdUrl) {
  // sourceIdUrl: https://openalex.org/Sxxxxx
  const id = norm(sourceIdUrl).replace(/^https?:\/\/openalex\.org\//i, "");
  if (!id) return null;
  const url = `https://api.openalex.org/sources/${id}`;
  return await fetchJsonWithRetry(url);
}

async function main() {
  const projectRoot = process.cwd();

  // 默认更新 canonical
  const defaultIn = path.join(
    projectRoot,
    ".claude/skills/journal-catalog/references/system/journals.yml"
  );
  const inPath = path.resolve(projectRoot, arg("--in", defaultIn));

  const dryRun = hasFlag("--dry-run");
  const delayMs = parseInt(arg("--delay-ms", "150"), 10);
  const offline = hasFlag("--offline"); // 只做本地变更，不请求 OpenAlex（保底模式）

  if (!fs.existsSync(inPath)) {
    throw new Error(`Input not found: ${inPath}`);
  }

  const parsed = YAML.parse(fs.readFileSync(inPath, "utf8"));
  const journals = parsed?.journals;
  if (!Array.isArray(journals)) throw new Error(`Invalid YAML: expected "journals" list in ${inPath}`);

  console.log(`[resolve_openalex_sources] in = ${path.relative(projectRoot, inPath)}`);
  console.log(`[resolve_openalex_sources] offline=${offline} dryRun=${dryRun} delayMs=${delayMs}`);

  let ok = 0, miss = 0, changed = 0, skipped = 0, err = 0;

  for (const j of journals) {
    const name = norm(j?.name) || "(no-name)";
    const short = norm(j?.short) || "";
    const label = short ? `${short} | ${name}` : name;

    // 如果已经有 openalex_source_id 且 site 已有，直接跳过
    if (norm(j.openalex_source_id) && norm(j.site)) {
      skipped++;
      continue;
    }

    const issns = [];
    const i1 = toIssnHyphen(j.issn);
    const i2 = toIssnHyphen(j.eissn);
    if (i1) issns.push(i1);
    if (i2 && i2 !== i1) issns.push(i2);

    if (offline) {
      // 离线模式不做 OpenAlex 请求
      miss++;
      continue;
    }

    try {
      let found = null;

      // Step A: 用 ISSN/eISSN 找 source
      for (const issn of issns) {
        const r = await resolveSourceByIssn(issn);
        if (r?.id) { found = r; break; }
        await sleep(delayMs);
      }

      if (!found?.id) {
        console.log(`[MISS] ${label} (no source via issn/eissn)`);
        miss++;
        continue;
      }

      // Step B: 写 openalex_source_id/display_name
      const beforeId = norm(j.openalex_source_id);
      const beforeDn = norm(j.openalex_source_display_name);
      const beforeSite = norm(j.site);

      const newId = norm(found.id); // https://openalex.org/S...
      const newDn = norm(found.display_name);

      // Step C: 拉取 source detail 取 homepage_url（更稳）
      let homepage = "";
      try {
        const detail = await fetchSourceById(newId);
        homepage = cleanUrl(detail?.homepage_url || "");
      } catch (e) {
        // detail 拉不到也不致命，保留为空
        console.warn(`[WARN] ${label} fetch source detail failed: ${String(e?.message || e)}`);
      }

      if (!dryRun) {
        if (newId) j.openalex_source_id = newId;
        if (newDn) j.openalex_source_display_name = newDn;
        if (!beforeSite && homepage) j.site = homepage;
      }

      const afterId = newId || beforeId;
      const afterDn = newDn || beforeDn;
      const afterSite = (!beforeSite && homepage) ? homepage : beforeSite;

      const isChanged =
        afterId !== beforeId ||
        afterDn !== beforeDn ||
        afterSite !== beforeSite;

      if (isChanged) changed++;

      console.log(`[OK] ${label} -> ${afterDn || "(no-display-name)"} -> ${afterId} ${afterSite ? `| site=${afterSite}` : ""}`);
      ok++;

      await sleep(delayMs);
    } catch (e) {
      console.error(`[ERR] ${label}: ${String(e?.message || e)}`);
      err++;
    }
  }

  // 写回
  if (!dryRun) {
    fs.writeFileSync(inPath, YAML.stringify(parsed), "utf8");
    console.log(`\n[resolve_openalex_sources] wrote back = ${path.relative(projectRoot, inPath)}`);
  } else {
    console.log(`\n[resolve_openalex_sources] dry-run: no file written`);
  }

  console.log(`[resolve_openalex_sources] summary: ok=${ok} changed=${changed} miss=${miss} skipped=${skipped} err=${err}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});