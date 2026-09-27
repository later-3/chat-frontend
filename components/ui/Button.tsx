import { forwardRef, type ButtonHTMLAttributes } from "react";
import { IconArrowLeft } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import styles from "./ui.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  iconOnly?: boolean;
}
/** Actions share size, focus, disabled and colour; selection rows retain their own semantics. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = "secondary", iconOnly = false, className = "", type = "button", ...props
}, ref) {
  return <button {...props} ref={ref} type={type} data-ui-button={variant}
    className={`${styles.button} ${iconOnly ? styles.icon : ""} ${className}`} />;
});

export function BackButton({ label, ...props }: Omit<ButtonProps, "children"> & { label?: string }) {
  const { t } = useI18n();
  const text = label ?? t("workspaceNav.back");
  return <Button {...props} variant="ghost" aria-label={text} title={text}>
    <IconArrowLeft size={18} aria-hidden="true" /><span>{text}</span>
  </Button>;
}
