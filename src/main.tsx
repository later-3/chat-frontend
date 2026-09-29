import { ConfirmationProvider } from "@/components/ui/Confirmation";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
// Self-hosted variable fonts (latin subset); Chinese text falls back to the
// platform font stack declared on --font-sans / --font-mono.
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import { DeviceWorkspaceRoot } from "@/components/DeviceWorkspaceRoot";
import { PwaRegistration } from "@/components/PwaRegistration";
import { I18nProvider } from "@/hooks/useI18n";

const root = document.getElementById("root");
if (root === null) throw new Error("缺少前端根节点 #root");

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <ConfirmationProvider>
      <PwaRegistration />
      <DeviceWorkspaceRoot />
      </ConfirmationProvider>
    </I18nProvider>
  </StrictMode>,
);
