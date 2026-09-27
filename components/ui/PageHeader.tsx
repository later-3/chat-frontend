import type { ReactNode, Ref } from "react";
import { BackButton } from "./Button";
import styles from "./ui.module.css";

export function PageHeader({ title, description, onBack, backLabel, children, titleId, headingRef }: {
  title: string; description?: string; onBack: () => void; backLabel?: string;
  children?: ReactNode; titleId?: string; headingRef?: Ref<HTMLHeadingElement>;
}) {
  return <header className={styles.header} data-ui-page-header>
    <BackButton onClick={onBack} label={backLabel} />
    <div className={styles.heading}><h1 id={titleId} ref={headingRef} tabIndex={-1}>{title}</h1>{description && <p>{description}</p>}</div>
    {children && <div className={styles.actions}>{children}</div>}
  </header>;
}
