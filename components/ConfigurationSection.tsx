import type { ComponentProps, ReactNode } from "react";
import { IconChevronRight } from "@tabler/icons-react";
import styles from "./ConfigurationSection.module.css";

/** A compact disclosure row shared by Friend and Workflow settings. */
export function ConfigurationSection({ title, children, ...props }: Omit<ComponentProps<"details">, "title"> & { title: ReactNode }) {
  return <details {...props} className={[styles.section, props.className].filter(Boolean).join(" ")}>
    <summary className={styles.heading}><span>{title}</span><IconChevronRight size={16} aria-hidden="true" /></summary>
    <div className={styles.content}>{children}</div>
  </details>;
}
