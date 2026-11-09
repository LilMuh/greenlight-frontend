import { useEffect, useState } from "react";
import { startGoogleSignIn } from "../googleRedirect";
import { STRINGS } from "../strings";

const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

export const googleSignInEnabled = CLIENT_ID !== "";

// 自绘的 Google 品牌按钮，点击后整页跳到 Google（流程见 googleRedirect.ts）。
// 不再用 Google 渲染的按钮：GIS 脚本已移除（iPhone Safari 上它的弹窗交接会白屏），
// 外观按 Google Sign-In 品牌规范画：白底、灰边、官方四色 G 图标。
export function GoogleButton({ onNotice }: { onNotice: (message: string) => void }) {
  const [redirecting, setRedirecting] = useState(false);

  // 从 Google 页按返回键时，页面从 bfcache 恢复，状态还停在「跳转中」，需要复位
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setRedirecting(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  if (!googleSignInEnabled) return null;

  const handleClick = () => {
    if (redirecting) return;
    if (startGoogleSignIn(CLIENT_ID)) {
      setRedirecting(true);
    } else {
      onNotice(STRINGS.googleStorageBlocked);
    }
  };

  return (
    <div className="wa-google">
      <button type="button" className="wa-google-btn" disabled={redirecting} onClick={handleClick}>
        <span className="wa-google-icon">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            <path fill="none" d="M0 0h48v48H0z" />
          </svg>
        </span>
        <span className="wa-google-label">{STRINGS.continueWithGoogle}</span>
      </button>
    </div>
  );
}
