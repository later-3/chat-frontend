import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "./styles.css";
import { AuthGate } from "@/components/AuthGate";
import { AuthSessionMonitor } from "@/components/AuthSessionMonitor";
import { DeviceWorkspaceRoot } from "@/components/DeviceWorkspaceRoot";
import { PwaRegistration } from "@/components/PwaRegistration";
import { I18nProvider } from "@/hooks/useI18n";

const root = document.getElementById("root");
if (root === null) throw new Error("缺少前端根节点 #root");

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <PwaRegistration />
      <AuthGate>
        <AuthSessionMonitor />
        <DeviceWorkspaceRoot />
      </AuthGate>
    </I18nProvider>
  </StrictMode>,
);
