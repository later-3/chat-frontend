import { IconChevronRight } from "@tabler/icons-react";
import { useState } from "react";
import { useI18n } from "@/hooks/useI18n";

export interface WorkspaceSetting {
  id: string;
  scope: "personal" | "project";
  label: string;
  description: string;
  onOpen: () => void;
  disabled?: boolean;
}
export function WorkspaceSettings({ items, wideContent, onContentWidth, theme, onTheme, language, onLanguage, onBack, onRefresh, onSelfCheck, projectLabel }: {
  projectLabel?: string;
  items: WorkspaceSetting[];
  wideContent: boolean;
  onContentWidth: () => void;
  theme: string;
  onTheme: () => void;
  language: string;
  onLanguage: () => void;
  onBack: () => void;
  onRefresh: () => void;
  onSelfCheck?: () => void;
}) {
  const { t } = useI18n();
  const [section, setSection] = useState<"appearance" | "personal" | "project" | "utilities">("appearance");
  return <section className="workspace-settings" aria-labelledby="workspace-settings-title">
    <header><div><h1 id="workspace-settings-title">{t("workspaceNav.settings")}</h1><p>{t("workspaceNav.settingsHint")}</p></div>
      <button type="button" className="workspace-button" onClick={onBack}>{t("workspaceNav.back")}</button></header>
    <div className="workspace-settings-layout">
    <nav className="workspace-settings-nav" aria-label="设置分类">{([
      ["appearance", t("workspaceNav.appearance")], ["personal", "个人能力与记忆"], ["project", "项目资源"], ["utilities", t("workspaceNav.utilities")]
    ] as const).map(([id, label]) => <button type="button" key={id} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}>{label}</button>)}</nav>
    <div className="workspace-settings-content">
      {section === "appearance" && <section>
      <h2>{t("workspaceNav.appearance")}</h2>
      <div className="workspace-settings-group">
        <button type="button" onClick={onTheme}><span>{t("workspaceNav.theme")}</span><span>{theme}<IconChevronRight size={16} /></span></button>
        <button type="button" onClick={onContentWidth} aria-pressed={wideContent}><span>{t("workspaceNav.contentWidth")}</span><span>{t(wideContent ? "workspaceNav.wide" : "workspaceNav.standard")}<IconChevronRight size={16} /></span></button>
        <button type="button" onClick={onLanguage}><span>{t("workspaceNav.language")}</span><span>{language}<IconChevronRight size={16} /></span></button>
      </div>
      </section>}
      {(section === "personal" || section === "project") && <section>
      <h2>{section === "personal" ? "个人能力与记忆" : "项目资源"}</h2>
      <p className="workspace-settings-scope">{section === "personal" ? "模型和认证由 Chat 统一管理；记忆页面可选择 Personal 或 Project 范围。Friend 的身份、运行策略与私人记忆在 Friend 管理中配置。" : `当前上下文：${projectLabel || "尚未选择项目"}。此处浏览项目可见资源；Agent 的实际选用在对应 Agent 配置中管理。`}</p>
      <div className="workspace-settings-group">{items.filter(item => item.scope === section).map(item => <button type="button" key={item.id} onClick={item.onOpen} disabled={item.disabled}>
        <span><strong>{item.label}</strong><small>{item.disabled ? t("common.agentConfigNeedProject") : item.description}</small></span><IconChevronRight size={18} />
      </button>)}</div>
      </section>}
      {section === "utilities" && <section><h2>{t("workspaceNav.utilities")}</h2>
      <div className="workspace-settings-group">
        <button type="button" onClick={onRefresh}><span>{t("mobile.refreshWorkspace")}</span><IconChevronRight size={18} /></button>
        {onSelfCheck && <button type="button" onClick={onSelfCheck}><span>{t("mobile.selfCheck")}</span><IconChevronRight size={18} /></button>}
      </div>
      </section>}
    </div></div>
  </section>;
}
