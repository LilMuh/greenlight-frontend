// 三页共用的头部：品牌 → 标签条 → 账号区。布局（窄屏两行 / 宽屏一行）全在 site-header.css 里。
import "./site-header.css";
import { useState } from "react";
import { getToken } from "../auth";
import { readHeaderUser, type HeaderUser } from "../headerUserCache";
import { HEADER_STRINGS, accountEmail, headerTabs, resolveHeaderUser, tabGridColumns, type HeaderPage } from "./headerLogic";

type Props = {
  active: HeaderPage;
  user: HeaderUser | null | undefined;
  tagline: string;
  onSignOut: () => void;
};

export function SiteHeader({ active, user, tagline, onSignOut }: Props) {
  // 惰性初始化在首次渲染里同步执行（main.tsx 用 flushSync），所以首帧就有账号区；
  // 页面的 user 一确认（含登出后的 null）就以页面为准，缓存只在「还在确认」期间兜底
  const [cached] = useState(() => readHeaderUser(getToken() !== null));
  const shown = resolveHeaderUser(user, cached);
  const tabs = headerTabs(shown, active);
  const email = accountEmail(shown);
  return (
    <header className="gl-hd">
      <div className="gl-hd-brand">
        <span className="gl-hd-dot" aria-hidden="true" />
        <div className="gl-hd-brand-text">
          <strong>{HEADER_STRINGS.appName}</strong>
          <small>{tagline}</small>
        </div>
      </div>
      <nav className="gl-hd-tabs" aria-label={HEADER_STRINGS.pagesLabel} style={{ gridTemplateColumns: tabGridColumns(tabs.length) }}>
        {tabs.map((tab) => (
          <a
            key={tab.page}
            className="gl-hd-tab"
            href={tab.href}
            {...(tab.active ? { "aria-current": "page" as const } : {})}
          >
            {tab.label}
          </a>
        ))}
      </nav>
      {email !== null && (
        <div className="gl-hd-account">
          <span className="gl-hd-email" title={email}>{email}</span>
          <button type="button" className="gl-hd-signout" onClick={onSignOut}>
            {HEADER_STRINGS.signOut}
          </button>
        </div>
      )}
    </header>
  );
}
