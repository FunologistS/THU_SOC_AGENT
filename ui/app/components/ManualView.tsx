"use client";

import { useState } from "react";
import { MarkdownPreview } from "@/components/MarkdownPreview";

export interface ManualData {
  intro: string;
  toc: { id: string; title: string }[];
  overviewRows: { area: string; description: string }[];
  skills: { id: string; label: string; content: string }[];
}

/** 说明书技能项悬停时通知父组件，用于高亮左侧技能工作台对应模块 */
export function ManualView({
  data,
  onSkillHover,
}: {
  data: ManualData;
  onSkillHover?: (skillId: string | null) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

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
        <div className="manual-toc mb-4 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-card)] p-4 shadow-thu-soft">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            目录
          </p>
          <ul className="space-y-1 text-sm">
            {data.toc.map((t) => (
              <li key={t.id}>
                <a
                  href={`#${t.id}`}
                  className="text-[var(--thu-purple)] hover:underline"
                >
                  {t.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
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
                  <td className="manual-table-td manual-table-td-area">{row.area}</td>
                  <td className="manual-table-td manual-table-td-desc">{row.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="skills" className="manual-skills">
        <h2 className="manual-h2">技能说明</h2>
        <p className="mb-3 text-sm text-[var(--text-muted)]">
          以下为管线中各环节的详细说明，需要时点击展开。
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
                  onClick={() => setOpenId(isOpen ? null : s.id)}
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
