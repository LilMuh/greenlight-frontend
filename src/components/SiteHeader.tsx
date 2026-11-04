// 三页共用的头部：品牌 → 标签条 → 账号区。布局（窄屏两行 / 宽屏一行）全在 site-header.css 里。
import "./site-header.css";
import type { UserDto } from "../api";
import { HEADER_STRINGS, accountEmail, headerTabs, tabGridColumns, type HeaderPage } from "./headerLogic";

type Props = {
  active: HeaderPage;
  user: UserDto | null | undefined;
  tagline: string;
  onSignOut: () => void;
};

export function SiteHeader({ active, user, tagline, onSignOut }: Props) {
  const tabs = headerTabs(user, active);
  const email = accountEmail(user);
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
