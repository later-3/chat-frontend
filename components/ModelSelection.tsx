import { useId } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { ChatModelCatalogModel } from "@/lib/chat-workflows-browser";
import { SearchSelect } from "./SearchSelect";
import styles from "./SelectionControl.module.css";

export function ModelSelection({ models, value, onChange, inheritLabel, disabled, inheritedModelKey }: {
  models: readonly ChatModelCatalogModel[]; value: string; onChange: (key: string) => void;
  inheritLabel: string; disabled?: boolean; inheritedModelKey?: string;
}) {
  const { t } = useI18n();
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
  </div>;
}

/** Levels are capabilities from Backend/Pi; the copy here does not define availability. */
export function ThinkingSelection({ levels, value, onChange, inheritLabel, disabled, capabilitiesPending = false }: {
  levels: readonly string[]; value:string; onChange:(value:string) => void;
  inheritLabel:string; disabled?:boolean;
  capabilitiesPending?:boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const options = [{ value:"", label:inheritLabel }, ...(capabilitiesPending ? [] : levels).map(level => ({ value:level, label:t(`design.thinking.${level}`) }))];
  const unavailable = value !== "" && !levels.includes(value);
  return <div className={styles.field}>
    <fieldset className={styles.choices} disabled={disabled} aria-describedby={`${id}-hint`}>
      <legend className={styles.legend}>{t("design.thinking")}</legend>
      {options.map(option => <label key={option.value} className={styles.choice}>
        <input type="radio" name={id} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
        <span>{option.label}</span>
      </label>)}
    </fieldset>
    <p id={`${id}-hint`} className={styles.hint}>{capabilitiesPending ? t("design.thinkingPending") : unavailable ? t("design.thinkingUnavailable", { level:value }) : value ? t(`design.thinkingHint.${value}`) : t("design.thinkingInherited")}</p>
  </div>;
}
