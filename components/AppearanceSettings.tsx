import { IconCheck, IconLayersIntersect, IconSquareRounded } from "@tabler/icons-react";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/hooks/useI18n";
import { PALETTES } from "@/lib/appearance";

/** Material and palette are independent choices shared by every application surface. */
export function AppearanceSettings() {
  const { t } = useI18n();
  const { appearance, setAppearance } = useTheme();
  return <>
    <section className="settings-section">
      <h3>{t("appearance.material")}</h3><p>{t("appearance.materialHint")}</p>
      <div className="appearance-materials" role="group" aria-label={t("appearance.material")}>
        {(["paper", "glass"] as const).map(material => <button type="button" key={material}
          aria-pressed={appearance.material === material} onClick={() => setAppearance({ material })}>
          <span className={`appearance-material-sample is-${material}`} aria-hidden="true">
            {material === "paper" ? <IconSquareRounded size={24} stroke={1.5} /> : <IconLayersIntersect size={24} stroke={1.5} />}
          </span><span><strong>{t(`appearance.${material}`)}</strong><small>{t(`appearance.${material}Hint`)}</small></span>
          {appearance.material === material && <IconCheck size={16} aria-hidden="true" />}
        </button>)}
      </div>
    </section>
    <section className="settings-section">
      <h3>{t("appearance.palette")}</h3><p>{t("appearance.paletteHint")}</p>
      <div className="appearance-palettes" role="group" aria-label={t("appearance.palette")}>
        {PALETTES.map(palette => <button type="button" key={palette} data-palette-choice={palette}
          aria-pressed={appearance.palette === palette} onClick={() => setAppearance({ palette })}>
          <span className="appearance-swatch" aria-hidden="true"><i/><i/><i/></span>
          <span>{t(`appearance.palette.${palette}`)}</span>
          {appearance.palette === palette && <IconCheck size={14} aria-hidden="true" />}
        </button>)}
      </div>
    </section>
    <section className="settings-section appearance-effects">
      <h3>{t("appearance.effects")}</h3>
      {(["background", "opaque", "motion"] as const).map(key => <label key={key}>
        <span><strong>{t(`appearance.${key}`)}</strong><small>{t(`appearance.${key}Hint`)}</small></span>
        <input type="checkbox" checked={key === "motion" ? appearance.motion === "reduced" : appearance[key]}
          onChange={event => setAppearance(key === "motion" ? { motion: event.target.checked ? "reduced" : "full" } : { [key]: event.target.checked })}/>
      </label>)}
    </section>
  </>;
}
