import { type ReactNode, useEffect, useState } from "react";

interface Props {
  children: ReactNode;
}

type AuthState = "checking" | "ready" | "unavailable";

function loginUrl(): string {
  const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `/login?${new URLSearchParams({ next }).toString()}`;
}

/**
 * Nitro会保护所有产品API；这个前端门负责在渲染工作区之前确认Cookie仍然有效，
 * 避免已过期的PWA先显示旧页面、随后才被某个API请求送回登录页。
 */
export function AuthGate({ children }: Props) {
  const [state, setState] = useState<AuthState>("checking");

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      setState("checking");
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (stopped) return;
        if (response.status === 401) {
          window.location.replace(loginUrl());
          return;
        }
        setState(response.ok ? "ready" : "unavailable");
      } catch {
        if (!stopped) setState("unavailable");
      }
    };
    void check();
    return () => {
      stopped = true;
    };
  }, []);

  if (state === "ready") return children;
  if (state === "unavailable") {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
        <section style={{ textAlign: "center", color: "var(--text-muted)" }}>
          <h1 style={{ margin: "0 0 10px", color: "var(--text)", fontSize: 20 }}>暂时无法连接 Chat</h1>
          <p style={{ margin: "0 0 18px", fontSize: 14 }}>请检查网络或服务状态后重试。</p>
          <button type="button" onClick={() => window.location.reload()}>重试</button>
        </section>
      </main>
    );
  }
  return <main aria-label="正在验证登录状态" style={{ minHeight: "100dvh", background: "var(--bg)" }} />;
}
