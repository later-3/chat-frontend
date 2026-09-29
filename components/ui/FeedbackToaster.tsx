import { Toaster, type ToasterProps } from "sonner";
import { useTheme } from "@/hooks/useTheme";

/**
 * Single mount point for the app-wide toast layer (sonner). Theming follows
 * the resolved app theme; surfaces use shared tokens so toasts stay on the
 * UI/UX spec's visual language. Success/error variants pass intent through
 * `toast.success` / `toast.error`; this component does not own copy.
 */
export function FeedbackToaster(props: ToasterProps) {
  const { isDark } = useTheme();
  return (
    <Toaster
      theme={isDark ? "dark" : "light"}
      position="bottom-right"
      offset={{ bottom: "calc(16px + var(--safe-area-bottom))" }}
      toastOptions={{
        style: {
          background: "var(--bg-panel)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-control)",
          boxShadow: "var(--shadow-popover)",
          fontFamily: "var(--font-sans)",
        },
      }}
      {...props}
    />
  );
}
