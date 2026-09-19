/** The hit area is independent of the switch track, including on touch screens. */
export function ConfigurationToggle({ enabled, loading, onToggle, label }: {
  enabled: boolean;
  loading: boolean;
  onToggle: () => void;
  label: string;
}) {
  return <button type="button" role="switch" aria-checked={enabled} aria-label={label}
    title={label} disabled={loading} onClick={onToggle} className="configuration-toggle">
    <span className="configuration-toggle-track" aria-hidden="true"><span /></span>
  </button>;
}
