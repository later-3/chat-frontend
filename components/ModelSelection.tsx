import { useEffect, useRef, useState } from "react";
import { IconAdjustmentsHorizontal } from "@tabler/icons-react";
import { Button } from "./ui/Button";
import { fetchChatModelCatalog, type ChatModelCatalog } from "@/lib/chat-workflows-browser";
import { useI18n } from "@/hooks/useI18n";
import type { ChatModelCatalogModel } from "@/lib/chat-workflows-browser";
import { SearchSelect, type SelectOption } from "./SearchSelect";
import styles from "./SelectionControl.module.css";

import { ModelsConfig } from "./ModelsConfig";

export function ModelSelection({ models, value, onChange, inheritLabel, disabled, inheritedModelKey, onCatalogChanged }: {
  models: readonly ChatModelCatalogModel[]; value: string; onChange: (key: string) => void;
  inheritLabel: string; disabled?: boolean; inheritedModelKey?: string;
  onCatalogChanged?: (catalog: ChatModelCatalog) => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const changed = useRef(false);
  const onCatalogChangedRef = useRef(onCatalogChanged);
  onCatalogChangedRef.current = onCatalogChanged;
  useEffect(() => {
    if (refreshVersion === 0) return;
    const controller = new AbortController();
    setRefreshError(null);
    void fetchChatModelCatalog(controller.signal).then(catalog => {
      if (!controller.signal.aborted) onCatalogChangedRef.current?.(catalog);
    }).catch(cause => {
      if (!controller.signal.aborted) setRefreshError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => controller.abort();
  }, [refreshVersion]);
  const options = models.map(model => ({
    value: `${model.provider}/${model.modelId}`, label: model.name,
    detail: `${model.provider} · ${model.modelId}${model.authConfigured ? "" : ` · ${t("design.authRequired")}`}`,
    disabled: !model.authConfigured,
  }));
  if (value && !options.some(option => option.value === value)) options.unshift({ value, label: value, detail: t("design.modelUnavailable"), disabled: true });
  const selected = models.find(model => `${model.provider}/${model.modelId}` === (value || inheritedModelKey));
  return <div className={styles.field}>
    <SearchSelect label={t("design.model")} value={value} options={[{ value:"", label:inheritLabel }, ...options]} onChange={onChange} disabled={disabled} />
    {selected && <dl className={styles.capabilities} aria-label={t("models.capabilities")}>
      <div><dt>{t("models.imageInput")}</dt><dd>{t(selected.input === undefined ? "design.capabilityUnknown" : selected.input.includes("image") ? "design.capabilitySupported" : "design.capabilityUnsupported")}</dd></div>
      <div><dt>{t("models.contextWindow")}</dt><dd>{selected.contextWindow.toLocaleString()}</dd></div>
      <div><dt>{t("models.maxOutputTokens")}</dt><dd>{selected.maxTokens.toLocaleString()}</dd></div>
    </dl>}
    {onCatalogChanged && <div className={styles.modelSettings}>
      <Button variant="ghost" type="button" disabled={disabled} onClick={() => { changed.current = false; setEditing(true); }}>
        <IconAdjustmentsHorizontal size={16} aria-hidden="true" />{t("design.modelSettings")}
      </Button>
      <p className={styles.hint}>{t("design.modelSettingsScope")}</p>
    </div>}
    {refreshError && <div role="alert" className={styles.hint}>{refreshError}<Button variant="ghost" type="button" onClick={() => setRefreshVersion(version => version + 1)}>{t("common.retry")}</Button></div>}
    {editing && <ModelsConfig initialModel={selected ? { provider: selected.provider, modelId: selected.modelId } : undefined}
        onSaved={() => { changed.current = true; }} onClose={() => { setEditing(false); if (changed.current) setRefreshVersion(version => version + 1); }} />}
  </div>;
}

/** Levels are capabilities from Backend/Pi; the copy here does not define availability. */
export function ThinkingSelection({ levels, value, onChange, inheritLabel, disabled, capabilitiesPending = false }: {
  levels: readonly string[]; value:string; onChange:(value:string) => void;
  inheritLabel:string; disabled?:boolean;
  capabilitiesPending?:boolean;
}) {
  const { t } = useI18n();
  const options: SelectOption[] = [{ value:"", label:inheritLabel }, ...(capabilitiesPending ? [] : levels).map(level => ({ value:level, label:t(`design.thinking.${level}`) }))];
  const unavailable = value !== "" && !levels.includes(value);
  if (value && !options.some(option => option.value === value)) options.push({ value, label: t(`design.thinking.${value}`), disabled: true });
  return <div className={styles.field}>
    <SearchSelect label={t("design.thinking")} value={value} options={options} onChange={onChange} disabled={disabled}
      hint={capabilitiesPending ? t("design.thinkingPending") : unavailable ? t("design.thinkingUnavailable", { level:value }) : value ? t(`design.thinkingHint.${value}`) : t("design.thinkingInherited")} />
  </div>;
}
