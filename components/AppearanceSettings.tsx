import type React from "react";
import { IconCheck, IconMoon, IconSun } from "@tabler/icons-react";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/hooks/useI18n";
import { GLASS_PRESETS, PRESETS, PRESET_MODE, type Preset } from "@/lib/appearance";

const LIGHT_PRESETS: readonly Preset[] = PRESETS.filter(preset => PRESET_MODE[preset] === "light");
const DARK_PRESETS: readonly Preset[] = PRESETS.filter(preset => PRESET_MODE[preset] === "dark");

/**
 * The theme catalog is one radiogroup with roving tabindex (sample AppearancePicker):
 * arrow keys move selection and focus together, so a keyboard user never lands on a
 * card without applying it. Effects stay independent switches.
 */
export function AppearanceSettings() {
  const { t } = useI18n();
  const { appearance, setAppearance } = useTheme();
  const current = appearance.preset;
  const isGlass = (GLASS_PRESETS as readonly string[]).includes(current);
  const choose = (preset: Preset) => {
    if (preset !== current) setAppearance({ preset });
  };
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? PRESETS[0]
      : event.key === "End" ? PRESETS[PRESETS.length - 1]
        : PRESETS[(index + (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : PRESETS.length - 1)) % PRESETS.length];
    choose(next);
    document.getElementById(`appearance-preset-${next}`)?.focus();
  };
  const renderPreset = (preset: Preset) => (
    <button type="button" key={preset} id={`appearance-preset-${preset}`} className="appearance-preset"
      role="radio" aria-checked={current === preset} tabIndex={current === preset ? 0 : -1}
      aria-label={`${t(`appearance.preset.${preset}`)} · ${t(`appearance.caption.${preset}`)}`}
      onClick={() => choose(preset)} onKeyDown={event => onKeyDown(event, PRESETS.indexOf(preset))}>
      <span className="appearance-preset-sample" data-preset={preset} aria-hidden="true">
        <span className="appearance-mini-window">
          <span className="appearance-mini-sidebar"><i /><i /><i /></span>
          <span className="appearance-mini-content"><b /><i /><span className="appearance-mini-input" /><span className="appearance-mini-action" /></span>
          <span className="appearance-mini-menu"><i /><i /></span>
        </span>
      </span>
      <span className="appearance-preset-title">{t(`appearance.preset.${preset}`)}{current === preset && <IconCheck size={14} aria-hidden="true" />}</span>
      <small>{t(`appearance.caption.${preset}`)}</small>
    </button>
  );
  return <>
    <section className="settings-section">
      <h3>{t("appearance.presets")}</h3><p>{t("appearance.presetsHint")}</p>
      <div role="radiogroup" aria-label={t("appearance.presets")}>
        <div className="appearance-preset-group">
          <div className="appearance-preset-group-title"><IconSun size={14} aria-hidden="true" /><span>{t("appearance.group.light")}</span><small>{LIGHT_PRESETS.length}</small></div>
          <div className="appearance-preset-options">{LIGHT_PRESETS.map(renderPreset)}</div>
        </div>
        <div className="appearance-preset-group">
          <div className="appearance-preset-group-title"><IconMoon size={14} aria-hidden="true" /><span>{t("appearance.group.dark")}</span><small>{DARK_PRESETS.length}</small></div>
          <div className="appearance-preset-options">{DARK_PRESETS.map(renderPreset)}</div>
        </div>
      </div>
    </section>
    <section className="settings-section appearance-effects">
      <h3>{t("appearance.effects")}</h3>
      <label>
        <span><strong>{t("appearance.background")}</strong><small>{t("appearance.backgroundHint")}</small></span>
        <input type="checkbox" role="switch" checked={appearance.background}
          onChange={event => setAppearance({ background: event.target.checked })} />
      </label>
      <label>
        <span><strong>{t("appearance.motion")}</strong><small>{t("appearance.motionHint")}</small></span>
        <input type="checkbox" role="switch" checked={appearance.motion === "full"}
          onChange={event => setAppearance({ motion: event.target.checked ? "full" : "reduced" })} />
      </label>
      <label>
        <span><strong>{t("appearance.opaque")}</strong><small>{t(isGlass ? "appearance.opaqueHint" : "appearance.opaqueHintOnly")}</small></span>
        <input type="checkbox" role="switch" checked={appearance.opaque} disabled={!isGlass}
          onChange={event => setAppearance({ opaque: event.target.checked })} />
      </label>
    </section>
    <p className="appearance-note">{t("appearance.note")}</p>
  </>;
}
