"use client";

import { useState, useEffect } from "react";
import { MarkdownPreview } from "@/components/MarkdownPreview";

export interface ManualData {
  intro: string;
  toc: { id: string; title: string }[];
  overviewRows: { area: string; description: string }[];
  skills: { id: string; label: string; content: string }[];
}

/** 说明书技能项悬停时通知父组件，用于高亮左侧技能工作台对应模块；点击功能一览中的区域名可展开并滚动侧栏对应板块；点击技能工作台详情某项可展开侧栏并定位到该技能 */
export function ManualView({
  data,
  onSkillHover,
  onAreaClick,
  onSkillClick,
}: {
  data: ManualData;
  onSkillHover?: (skillId: string | null) => void;
  /** 点击「本页功能一览」表格中的区域名时调用，用于展开侧栏对应板块并滚动到该板块顶部 */
  onAreaClick?: (area: string) => void;
  /** 点击「技能工作台详情」中某一技能时调用，用于展开侧栏技能工作台并定位到对应技能卡片 */
  onSkillClick?: (skillId: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [disciplinesOpen, setDisciplinesOpen] = useState(false);
  const [disciplines, setDisciplines] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/journals-by-discipline")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.disciplines) && d.disciplines.length > 0) {
          setDisciplines(d.disciplines);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="manual-view space-y-6">
      <section id="intro" className="manual-intro">
        <h2 className="manual-h2">简介</h2>
        <div className="prose-reader">
          <MarkdownPreview content={data.intro} />
        </div>
      </section>

      <section id="overview" className="manual-overview">
        <h2 className="manual-h2">本页功能一览</h2>
        <div className="manual-table-wrap overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--bg-card)] shadow-thu-soft">
          <table className="manual-table w-full border-collapse text-sm">
            <thead>
              <tr className="manual-table-head-row">
                <th className="manual-table-th manual-table-th-area">区域</th>
                <th className="manual-table-th manual-table-th-desc">说明</th>
              </tr>
            </thead>
            <tbody>
              {data.overviewRows.map((row) => (
                <tr key={row.area} className="manual-table-body-row">
                  <td className="manual-table-td manual-table-td-area">
                    {onAreaClick ? (
                      <button
                        type="button"
                        onClick={() => onAreaClick(row.area)}
                        className="text-left font-medium text-[var(--thu-purple)] hover:underline focus:outline-none focus:underline"
                      >
                        {row.area}
                      </button>
                    ) : (
                      row.area
                    )}
                  </td>
                  <td className="manual-table-td manual-table-td-desc">
                    <span>{row.description}</span>
                    {row.area === "期刊数据库" && disciplines.length > 0 && (
                      <div className="mt-3 rounded-[var(--radius)] border border-[var(--border-soft)] bg-[var(--bg-page)] overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setDisciplinesOpen((o) => !o)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] font-medium text-[var(--text)] hover:bg-[var(--thu-purple-subtle)] transition-colors"
                          aria-expanded={disciplinesOpen}
                        >
                          <span>现有解析学科（{disciplines.length} 个）</span>
                          <span className={`inline-block transition-transform ${disciplinesOpen ? "rotate-180" : ""}`} aria-hidden>▼</span>
                        </button>
                        {disciplinesOpen && (
                          <div className="border-t border-[var(--border-soft)] px-3 py-2">
                            <ul className="list-none space-y-1 text-[12px] text-[var(--text-muted)]">
                              {[...disciplines].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })).map((d) => (
                                <li key={d}>{d}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="skills" className="manual-skills">
        <h2 className="manual-h2">技能工作台详情</h2>
        <p className="mb-3 text-sm text-[var(--text-muted)]">
          以下为管线中各环节的详细说明，需要时点击展开；点击某项时侧栏将展开「技能工作台」并定位到对应技能。
        </p>
        <ul className="space-y-2">
          {data.skills.map((s) => {
            const isOpen = openId === s.id;
            return (
              <li
                key={s.id}
                className="rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--bg-card)] shadow-thu-soft overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(isOpen ? null : s.id);
                    onSkillClick?.(s.id);
                  }}
                  onMouseEnter={() => onSkillHover?.(s.id)}
                  onMouseLeave={() => onSkillHover?.(null)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[var(--text)] hover:bg-[var(--thu-purple-subtle)] transition-colors"
                >
                  <span>{s.label}</span>
                  <span
                    className={`inline-block transition-transform ${isOpen ? "rotate-180" : ""}`}
                    aria-hidden
                  >
                    ▼
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-[var(--border-soft)] px-4 py-3 bg-[var(--bg-page)]">
                    <div className="prose-reader max-h-[50vh] overflow-y-auto">
                      <MarkdownPreview content={s.content} />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
