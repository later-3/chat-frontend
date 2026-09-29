import { PageHeader } from "./ui/PageHeader";
import { Button } from "./ui/Button";

import { InterfaceFeedback } from "./InterfaceFeedback";
import { IconAdjustments, IconChevronRight, IconDeviceDesktop, IconMoon, IconSun, IconPalette, IconFolder, IconUser } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { ThemePreference } from "@/hooks/useTheme";
import type { Locale } from "@/lib/i18n/types";
import { SearchSelect, type SelectOption } from "./SearchSelect";

export interface WorkspaceSetting {
  id: string;
  scope: "personal" | "project";
  label: string;
  description: string;
  onOpen: () => void;
  disabled?: boolean;
}
type Section = "appearance" | "personal" | "project" | "utilities";
function currentSection(): Section {
  const section = new URL(window.location.href).searchParams.get("settings");
  return section === "personal" || section === "project" || section === "utilities" ? section : "appearance";
}
export function WorkspaceSettings({ items, wideContent, onContentWidth, theme, onTheme, language, onLanguage, onBack, onRefresh, onSelfCheck, projectId, projects, onProject, projectError, onRetryProjects }: {
  projectError: string | null;
  onRetryProjects: () => void;
  projectId: string;
  projects: readonly SelectOption[];
  onProject: (id:string) => void;
  items: WorkspaceSetting[];
  wideContent: boolean;
  onContentWidth: () => void;
  theme: ThemePreference;
  onTheme: (theme:ThemePreference) => void;
  language: Locale;
  onLanguage: (language:Locale) => void;
  onBack: () => void;
  onRefresh: () => void;
  onSelfCheck?: () => void;
}) {
  const { t } = useI18n();
  const [section, setSection] = useState(currentSection);
  const [refreshed, setRefreshed] = useState(false);
  useEffect(() => {
    const restore = () => setSection(currentSection());
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  function selectSection(next: Section) {
    const url = new URL(window.location.href);
    url.searchParams.set("settings", next);
    window.history.pushState({ workspaceNavigation:true }, "", `${url.pathname}${url.search}${url.hash}`);
    setSection(next);
  }
  const sections = [
    { id:"appearance", label:t("workspaceNav.appearance"), Icon:IconPalette },
    { id:"personal", label:t("design.settingsPersonal"), Icon:IconUser },
    { id:"project", label:t("design.settingsProject"), Icon:IconFolder },
    { id:"utilities", label:t("workspaceNav.utilities"), Icon:IconAdjustments },
  ] as const;
  return <section className="workspace-settings" aria-labelledby="workspace-settings-title">
    <PageHeader title={t("workspaceNav.settings")} titleId="workspace-settings-title" description={t("workspaceNav.settingsHint")} onBack={onBack} />
    <div className="workspace-settings-layout">
      <nav className="workspace-settings-nav" aria-label={t("design.settingsNav")}>{sections.map(({id,label,Icon}) =>
        <button type="button" key={id} data-settings-section={id} aria-current={section === id ? "page" : undefined} onClick={() => selectSection(id)}><Icon size={18} stroke={1.6}/><span>{label}</span></button>)}</nav>
      <div className="workspace-settings-content">
        <h2>{sections.find(item => item.id === section)?.label}</h2>
        {section === "appearance" && <>
          <p className="workspace-settings-scope">{t("design.appearanceHint")}</p>
          <section className="settings-section">
            <h3>{t("workspaceNav.theme")}</h3><p>{t("design.themeHint")}</p>
            <div className="settings-theme-choices" role="group" aria-label={t("workspaceNav.theme")}>{([
              ["light",IconSun], ["dark",IconMoon], ["auto",IconDeviceDesktop],
            ] as const).map(([value,Icon]) => <button key={value} type="button" aria-pressed={theme === value} onClick={() => onTheme(value)}><Icon size={26} stroke={1.4}/><span>{t(`design.theme.${value}`)}</span></button>)}</div>
          </section>
          <section className="settings-section"><h3>{t("workspaceNav.contentWidth")}</h3><p>{t("design.densityHint")}</p>
            <div className="settings-segments" role="group" aria-label={t("workspaceNav.contentWidth")}>{[false,true].map(wide => <button key={String(wide)} type="button" aria-pressed={wideContent === wide} onClick={() => { if (wide !== wideContent) onContentWidth(); }}>{t(wide ? "workspaceNav.wide" : "workspaceNav.standard")}</button>)}</div>
          </section>
          <section className="settings-section"><h3>{t("workspaceNav.language")}</h3><p>{t("design.languageHint")}</p>
            <div className="settings-segments" role="group" aria-label={t("workspaceNav.language")}>{([['en',t('language.en')],['zh-CN',t('language.zh')]] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={language === value} onClick={() => onLanguage(value)}>{label}</button>)}</div>
          </section>
        </>}
        {(section === "personal" || section === "project") && <>
          <p className="workspace-settings-scope">{t(section === "personal" ? "design.settingsPersonalHint" : "design.settingsProjectHint")}</p>
          {section === "project" && projectError && <p role="alert"><InterfaceFeedback message={projectError} /> <Button variant="secondary" className="workspace-button" onClick={onRetryProjects}>{t("common.refresh")}</Button></p>}
          {section === "project" && <div className="settings-project-choice"><SearchSelect label={t("design.chooseProject")} value={projectId} options={[{value:"",label:t("design.noProject")},...projects]} onChange={onProject}/></div>}
          <div className="workspace-settings-group">{items.filter(item => item.scope === section).map(item => <button type="button" key={item.id} onClick={item.onOpen} disabled={item.disabled}>
            <span><strong>{item.label}</strong><small>{item.disabled ? t("common.agentConfigNeedProject") : item.description}</small></span><IconChevronRight size={18}/>
          </button>)}</div>
        </>}
        {section === "utilities" && <>
          <p className="workspace-settings-scope">{t("design.settingsUtilitiesHint")}</p>
          <div className="workspace-settings-group"><button type="button" onClick={() => { onRefresh(); setRefreshed(true); }}><span>{t("mobile.refreshWorkspace")}</span><IconChevronRight size={18}/></button>
            {onSelfCheck && <button type="button" onClick={onSelfCheck}><span>{t("mobile.selfCheck")}</span><IconChevronRight size={18}/></button>}
          </div>{refreshed && <p role="status" className="workspace-settings-scope">{t("design.refreshRequested")}</p>}
        </>}
      </div>
    </div>
  </section>;
}
