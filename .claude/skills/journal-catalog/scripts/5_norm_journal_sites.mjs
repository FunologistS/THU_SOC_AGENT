/**
 * 5_norm_journal_sites.mjs — 主流程第 5 步（可选）：规范化 journals.yml 中每条期刊的 site（主页 URL）
 *
 * What it does
 * - Read a canonical journals.yml (default: .claude/skills/journal-catalog/references/system/journals.yml)
 * - Normalize journals[].site:
 *    - force https
 *    - trim whitespace
 *    - remove fragments (#...)
 *    - remove most query params (but keep essential ones for Cambridge / T&F / Sage)
 *    - normalize hostname (incl. OUP legacy handling)
 *    - normalize trailing slash policy
 * - Optional: fix OUP root sites (https://academic.oup.com/) using OpenAlex:
 *    - First try source.homepage_url
 *    - Fallback: infer OUP journal slug from recent works landing_page_url (DOI 10.1093/<slug>/...)
 *
 * Output
 * - Write back to input file unless --dry-run
 * - Always write a snapshot:
 *      journals_sites_normalized_YYYYMMDD_vN.yml (in same dir as input)
 *
 * Usage
 *   node .../5_norm_journal_sites.mjs
 *   node .../5_norm_journal_sites.mjs --in path/to/journals.yml
 *   node .../5_norm_journal_sites.mjs --dry-run
 *   node .../5_norm_journal_sites.mjs --fix-oup-root
 *   node .../5_norm_journal_sites.mjs --delay-ms 150
 */

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const ROOT = process.cwd();

// ---------------------
// CLI
// ---------------------
function parseArgs(argv) {
  const args = {
    in: path.join(
      ROOT,
      ".claude/skills/journal-catalog/references/system/journals.yml"
    ),
    dryRun: false,
    fixOupRoot: false,
    delayMs: 150,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--in" && argv[i + 1]) {
      args.in = argv[++i];
    } else if (a === "--dry-run" || a === "--dryRun") {
      args.dryRun = true;
    } else if (a === "--fix-oup-root" || a === "--fixOupRoot") {
      args.fixOupRoot = true;
    } else if (a === "--delay-ms" && argv[i + 1]) {
      args.delayMs = Number(argv[++i] ?? 150);
      if (!Number.isFinite(args.delayMs) || args.delayMs < 0) args.delayMs = 150;
    }
  }
  return args;
}

const ARGS = parseArgs(process.argv);

// ---------------------
// Helpers
// ---------------------
function nowIso() {
  return new Date().toISOString();
}

function dateTagYYYYMMDD(d = new Date()) {
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readYaml(file) {
  const txt = fs.readFileSync(file, "utf-8");
  return YAML.parse(txt);
}

function writeYaml(file, obj) {
  const doc = new YAML.Document(obj);
  doc.contents = obj;
  doc.options.indent = 2;
  doc.options.lineWidth = 0;
  fs.writeFileSync(file, String(doc), "utf-8");
}

function ensureArray(x) {
  return Array.isArray(x) ? x : [];
}

function extractOpenAlexSourceId(openalex_source_id) {
  if (!openalex_source_id) return "";
  const s = String(openalex_source_id).trim();
  const m = s.match(/(S\d+)\b/);
  return m ? m[1] : "";
}

/**
 * OUP legacy URLs often look like:
 *   http://socpro.oxfordjournals.org/
 *   http://ser.oxfordjournals.org
 * where the *subdomain* encodes the journal slug.
 *
 * We must preserve that slug by mapping to:
 *   https://academic.oup.com/<slug>
 */
function mapOupLegacyToAcademic(u) {
  const host = (u?.hostname || "").toLowerCase();

  // Matches "<slug>.oxfordjournals.org"
  const m = host.match(/^([a-z0-9-]+)\.oxfordjournals\.org$/i);
  if (!m) return null;

  const slug = m[1];
  if (!slug || slug === "www") return null;

  return `https://academic.oup.com/${slug}`;
}

function normalizeHostname(hostname) {
  if (!hostname) return hostname;
  let h = hostname.toLowerCase().trim();

  // Normalize common "www."
  if (h.startsWith("www.")) h = h.slice(4);

  // If any oxfordjournals.org sneaks in without the subdomain (rare), map host to academic
  if (h.endsWith("oxfordjournals.org")) h = "academic.oup.com";

  return h;
}

function keepQueryParamForSite(host, key) {
  const k = key.toLowerCase();
  const h = (host || "").toLowerCase();

  if (h.includes("journals.cambridge.org")) return k === "jid";

  if (h.includes("tandfonline.com")) {
    return k === "journalcode" || k === "show";
  }

  if (h.includes("sagepub.com")) {
    return k === "prodid";
  }

  return false;
}

function normalizeSite(site) {
  if (!site) return "";

  let s = String(site).trim();
  if (!s) return "";

  // If missing scheme, assume https
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;

  let u;
  try {
    u = new URL(s);
  } catch {
    return s;
  }

  // ---- OUP legacy subdomain handling (MUST happen before generic hostname normalization)
  const oupMapped = mapOupLegacyToAcademic(u);
  if (oupMapped) {
    return normalizeSite(oupMapped);
  }

  // Force https
  u.protocol = "https:";

  // Normalize hostnames
  u.hostname = normalizeHostname(u.hostname);

  // Remove fragment
  u.hash = "";

  // Clean query params (platform keep-list)
  if (u.search) {
    const kept = new URLSearchParams();
    for (const [k, v] of u.searchParams.entries()) {
      if (keepQueryParamForSite(u.hostname, k)) kept.append(k, v);
    }
    const qs = kept.toString();
    u.search = qs ? `?${qs}` : "";
  }

  // Collapse multiple slashes in path
  u.pathname = u.pathname.replace(/\/{2,}/g, "/");

  // Trailing slash policy
  const host = u.hostname.toLowerCase();
  const isRoot = u.pathname === "/" || u.pathname === "";
  const isSageSubdomain =
    host.endsWith(".sagepub.com") && host !== "journals.sagepub.com";

  if (!isRoot && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/g, "");
  } else if (isRoot) {
    u.pathname = "/";
  }

  if (isSageSubdomain && (u.pathname === "/" || u.pathname === "")) {
    u.pathname = "/";
  }

  return u.toString();
}

function isOupRootSite(siteUrl) {
  if (!siteUrl) return false;
  try {
    const u = new URL(String(siteUrl).trim());
    return (
      u.hostname.toLowerCase() === "academic.oup.com" &&
      (u.pathname === "/" || u.pathname === "")
    );
  } catch {
    return false;
  }
}

function isNonRootAcademicOup(siteUrl) {
  if (!siteUrl) return false;
  try {
    const u = new URL(String(siteUrl).trim());
    return (
      u.hostname.toLowerCase() === "academic.oup.com" &&
      u.pathname &&
      u.pathname !== "/" &&
      u.pathname !== ""
    );
  } catch {
    return false;
  }
}

async function fetchOpenAlexSourceHomepage(sourceId) {
  const mailto = (process.env.OPENALEX_EMAIL || "").trim();
  const url = new URL(`https://api.openalex.org/sources/${sourceId}`);
  if (mailto) url.searchParams.set("mailto", mailto);

  const r = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`OpenAlex ${sourceId} HTTP ${r.status}`);
  const j = await r.json();
  return (j?.homepage_url || "").trim();
}

function extractOupSlugFromDoiOrUrl(maybeUrl) {
  if (!maybeUrl) return "";
  const s = String(maybeUrl).trim();
  if (!s) return "";

  // Case 1: doi.org/10.1093/<slug>/<rest>
  // Example: https://doi.org/10.1093/socpro/spaf080
  let m = s.match(/doi\.org\/10\.1093\/([a-z0-9-]+)\//i);
  if (m) return m[1].toLowerCase();

  // Case 2: explicit DOI string
  // Example: 10.1093/socpro/spaf080
  m = s.match(/\b10\.1093\/([a-z0-9-]+)\//i);
  if (m) return m[1].toLowerCase();

  // Case 3: already an academic.oup.com path
  // Example: https://academic.oup.com/socpro/article/...
  try {
    const u = new URL(s);
    if (u.hostname.toLowerCase() === "academic.oup.com") {
      const seg = (u.pathname || "/").split("/").filter(Boolean)[0] || "";
      if (seg) return seg.toLowerCase();
    }
  } catch {
    // ignore
  }

  return "";
}

async function fetchRecentWorksLandingUrlsBySource(sourceId, perPage = 5) {
  const mailto = (process.env.OPENALEX_EMAIL || "").trim();
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("filter", `primary_location.source.id:${sourceId}`);
  url.searchParams.set("per-page", String(perPage));
  url.searchParams.set("sort", "publication_date:desc");
  if (mailto) url.searchParams.set("mailto", mailto);

  const r = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`OpenAlex works ${sourceId} HTTP ${r.status}`);
  const j = await r.json();
  const results = Array.isArray(j?.results) ? j.results : [];
  const urls = [];
  for (const w of results) {
    const lp = w?.primary_location?.landing_page_url || "";
    if (lp && String(lp).trim()) urls.push(String(lp).trim());
  }
  return urls;
}

async function inferOupHomepageFromWorks(sourceId) {
  // Try a few recent works; extract DOI slug; construct https://academic.oup.com/<slug>
  const landingUrls = await fetchRecentWorksLandingUrlsBySource(sourceId, 5);
  for (const lp of landingUrls) {
    const slug = extractOupSlugFromDoiOrUrl(lp);
    if (!slug) continue;
    const candidate = normalizeSite(`https://academic.oup.com/${slug}`);
    if (isNonRootAcademicOup(candidate)) return candidate;
  }
  return "";
}

function nextSnapshotVersion(dir, prefix, dateTag) {
  const re = new RegExp(`^${prefix}_${dateTag}_v(\\d+)\\.yml$`, "i");
  let maxV = 0;
  if (!fs.existsSync(dir)) return 1;
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(re);
    if (m) {
      const v = Number(m[1]);
      if (Number.isFinite(v)) maxV = Math.max(maxV, v);
    }
  }
  return maxV + 1;
}

// ---------------------
// Main
// ---------------------
async function main() {
  const inputPath = ARGS.in;
  const inputDir = path.dirname(inputPath);
  const dateTag = dateTagYYYYMMDD(new Date());
  const prefix = "journals_sites_normalized";
  const version = nextSnapshotVersion(inputDir, prefix, dateTag);
  const snapshotPath = path.join(inputDir, `${prefix}_${dateTag}_v${version}.yml`);

  const data = readYaml(inputPath);
  const journals = ensureArray(data?.journals);

  let changed = 0;
  let fixedOupRoot = 0;
  let nonEmptySite = 0;

  // pass 1: normalize existing sites
  for (const j of journals) {
    const before = (j?.site ?? "").toString();
    if (before && before.trim()) nonEmptySite += 1;

    const after = normalizeSite(before);

    if (after !== before) {
      const short = (j?.short ?? "").toString().trim() || "(no-short)";
      console.log(`[normalize] ${short}: ${before} -> ${after}`);
      j.site = after;
      changed += 1;
    } else {
      j.site = after;
    }
  }

  // pass 2 (optional): fix OUP root sites using OpenAlex homepage_url with works-based fallback
  if (ARGS.fixOupRoot) {
    for (const j of journals) {
      const cur = (j?.site ?? "").toString().trim();
      if (!isOupRootSite(cur)) continue;

      const sid = extractOpenAlexSourceId(j?.openalex_source_id);
      if (!sid) continue;

      const short = (j?.short ?? "").toString().trim() || "(no-short)";

      try {
        // 2.1 try source.homepage_url first (A: may be <slug>.oxfordjournals.org -> mapped)
        const homepage = await fetchOpenAlexSourceHomepage(sid);
        if (ARGS.delayMs) await sleep(ARGS.delayMs);

        let candidate = homepage ? normalizeSite(homepage) : "";

        // Accept if it becomes a non-root academic.oup.com/<slug>
        if (isNonRootAcademicOup(candidate) && candidate !== cur) {
          console.log(
            `[fix-oup-root] ${short}: ${cur} -> ${candidate} (via OpenAlex source ${sid} homepage_url)`
          );
          j.site = candidate;
          fixedOupRoot += 1;
          changed += 1;
          continue;
        }

        // 2.2 fallback B: infer from recent works landing_page_url (often doi.org/10.1093/<slug>/...)
        candidate = await inferOupHomepageFromWorks(sid);
        if (ARGS.delayMs) await sleep(ARGS.delayMs);

        if (isNonRootAcademicOup(candidate) && candidate !== cur) {
          console.log(
            `[fix-oup-root] ${short}: ${cur} -> ${candidate} (via OpenAlex works fallback ${sid})`
          );
          j.site = candidate;
          fixedOupRoot += 1;
          changed += 1;
          continue;
        }

        // If still nothing, keep as-is (root)
      } catch (e) {
        console.warn(
          `[fix-oup-root][WARN] ${short}: OpenAlex fetch failed for ${sid}: ${e?.message || e}`
        );
      }
    }
  }

  const normMeta = {
    site_normalized_at: nowIso(),
    date_tag: dateTag,
    site_normalized_version: version,
    input: inputPath,
    checked_with_site: journals.length,
    changed,
    fixed_oup_root: fixedOupRoot,
    notes:
      "Normalized journals[].site (https, remove fragment, query keep-list for Cambridge/T&F/Sage; OUP legacy <slug>.oxfordjournals.org -> https://academic.oup.com/<slug> mapping; trailing slash policy; optional OpenAlex-based fix for OUP root using source.homepage_url with works-based fallback).",
  };
  const out = {
    ...data,
    meta: { ...(data.meta && typeof data.meta === "object" ? data.meta : {}), ...normMeta },
    journals,
  };

  if (!ARGS.dryRun) {
    writeYaml(inputPath, out);
    console.log(`\n[5_norm_journal_sites.mjs] wrote back = ${inputPath}`);
  } else {
    console.log(`\n[5_norm_journal_sites.mjs] dry-run (no write back)`);
  }

  writeYaml(snapshotPath, out);
  console.log(`[5_norm_journal_sites.mjs] wrote snapshot = ${snapshotPath}`);
  console.log(
    `[5_norm_journal_sites.mjs] summary: checked=${journals.length} changed=${changed} nonEmptySite=${nonEmptySite} fixOupRoot=${fixedOupRoot}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
