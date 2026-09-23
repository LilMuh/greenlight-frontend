import { useEffect, useRef } from "react";

// Google Identity Services 只用到这么一点，不值得装类型包
interface GoogleIdentity {
  accounts: {
    id: {
      initialize(options: { client_id: string; callback: (response: { credential: string }) => void }): void;
      renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
    };
  };
}
declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const SCRIPT_URL = "https://accounts.google.com/gsi/client";

let scriptPromise: Promise<GoogleIdentity> | null = null;

// 脚本全页只加载一次；加载失败允许下次重试
function loadGoogle(): Promise<GoogleIdentity> {
  if (window.google) return Promise.resolve(window.google);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.google ? resolve(window.google) : reject(new Error("GIS missing")));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("GIS failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export const googleSignInEnabled = CLIENT_ID !== "";

// Google 官方渲染的登录按钮。拿到的 credential 就是要交给后端校验的 ID Token。
export function GoogleButton({ onCredential }: { onCredential: (idToken: string) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // callback 在 initialize 时就固定了，用 ref 拿最新的处理函数
  const handlerRef = useRef(onCredential);
  handlerRef.current = onCredential;

  useEffect(() => {
    if (!googleSignInEnabled) return;
    let cancelled = false;
    loadGoogle()
      .then((google) => {
        if (cancelled || !containerRef.current) return;
        google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => handlerRef.current(response.credential),
        });
        google.accounts.id.renderButton(containerRef.current, {
          theme: "outline", size: "large", text: "continue_with", width: 318,
        });
      })
      .catch(() => {
        // 脚本被拦（广告拦截、网络）就只剩验证码登录，不打断页面
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!googleSignInEnabled) return null;
  return <div className="wa-google" ref={containerRef} />;
}
