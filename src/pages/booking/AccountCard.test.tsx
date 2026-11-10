// 账号卡片的 SSR 冒烟（D-18）：vitest 的环境是 node，没有 jsdom，所以用 react-dom/server 的 renderToStaticMarkup
// 渲染各状态，按标记字符串断言。effect 在 SSR 不执行（不会发请求、不会轮询），回调传空函数即可。
// 测试数据只用 .invalid 这类假域名，公开仓库里不放任何真实地址。
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BookingAccountDto, UserDto } from "../../api";
import { AccountCard, AccountLine } from "./AccountCard";
import { STRINGS } from "./strings";

const EMAIL = "acct@example.invalid";

const user = (over: Partial<UserDto> = {}): UserDto => ({
  id: 1, loginEmail: "a@example.invalid", displayName: null, notifyEmail: "a@example.invalid",
  notificationsEnabled: true, admin: false, googleLinked: false, enableAutoBooking: true,
  ...over,
});

const account = (over: Partial<BookingAccountDto> = {}): BookingAccountDto => ({
  id: 1, loginEmail: EMAIL, kind: "OWN", status: "VALID", reason: null,
  classCode: "PUB", verifiedAt: "2026-11-09T20:00:00Z", verifying: false,
  ...over,
});

const noop = () => {};
const render = (
  Component: typeof AccountCard | typeof AccountLine,
  acct: BookingAccountDto | null | undefined,
  loadFailed = false,
) =>
  renderToStaticMarkup(
    <Component user={user()} account={acct} loadFailed={loadFailed} onAccountChange={noop} onSignedOut={noop} onUnlinked={noop} />,
  );
// renderToStaticMarkup 会转义单引号，文案里带撇号时按转义后的形式比较
const escaped = (text: string) => text.replaceAll("&", "&amp;").replaceAll("'", "&#x27;");

describe("AccountLine（VALID 之后页面顶部的一行小字）", () => {
  it("OWN：登录邮箱、Valid、Change password、Unlink，没有密码框，没有 Re-verify", () => {
    const html = render(AccountLine, account());
    expect(html).toContain(EMAIL);
    expect(html).toContain(STRINGS.statusValid);
    expect(html).toContain(STRINGS.changePasswordBtn);
    expect(html).toContain(STRINGS.unlinkBtn);
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("Re-verify");
  });

  it("SHARED：显示 Shared 与 Unlink，没有 Change password", () => {
    const html = render(AccountLine, account({ kind: "SHARED" }));
    expect(html).toContain(STRINGS.statusShared);
    expect(html).toContain(STRINGS.unlinkBtn);
    expect(html).not.toContain(STRINGS.changePasswordBtn);
    expect(html).not.toContain(STRINGS.statusValid);
  });

  it("验证中：状态词是 Verifying…，两个按钮不可点", () => {
    const html = render(AccountLine, account({ verifying: true }));
    expect(html).toContain(STRINGS.statusVerifying);
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it("容器是带标题的 group，分隔点对读屏隐藏", () => {
    const html = render(AccountLine, account());
    expect(html).toContain('role="group"');
    expect(html).toContain(`aria-label="${STRINGS.accountTitle}"`);
    expect(html).toContain('aria-hidden="true"');
  });

  it("没有账号记录时什么都不渲染", () => {
    expect(render(AccountLine, null)).toBe("");
  });
});

describe("AccountCard（没有 VALID 账号时占表单位置的紧凑卡片）", () => {
  it("未绑定：邮箱输入、密码输入、Link account 与去绑定才能建任务的提示", () => {
    const html = render(AccountCard, null);
    expect(html).toContain("wa-bk-acct is-compact");
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain(STRINGS.linkBtn);
    expect(html).toContain(escaped(STRINGS.createNeedsLink));
    expect(html).not.toContain("readOnly");
  });

  it("BAD_CREDENTIALS：中文提示、只读且值为登录邮箱的邮箱框、密码框与 Unlink，没有 Re-verify", () => {
    const html = render(AccountCard, account({ status: "NEEDS_ACTION", reason: "BAD_CREDENTIALS", classCode: null, verifiedAt: null }));
    expect(html).toContain("密码错误，请重新输入密码。");
    expect(html).toMatch(new RegExp(`value="${EMAIL}"[^>]*readOnly=""|readOnly=""[^>]*value="${EMAIL}"`));
    expect(html).toContain('type="password"');
    expect(html).toContain(STRINGS.changePasswordSubmit);
    expect(html).toContain(STRINGS.unlinkBtn);
    expect(html).not.toContain("Re-verify");
    expect(html).not.toContain(STRINGS.accountRetryNote);
  });

  it("CHALLENGE：提示联系管理员并带原因码，仍有密码框与重新输入的说明", () => {
    const html = render(AccountCard, account({ status: "NEEDS_ACTION", reason: "CHALLENGE", classCode: null, verifiedAt: null }));
    expect(html).toContain("请联系管理员（原因：CHALLENGE）。");
    expect(html).toContain('type="password"');
    expect(html).toContain(STRINGS.accountRetryNote);
    expect(html).toContain(STRINGS.unlinkBtn);
  });

  it("NOT_VERIFIED 或 verifying=true：显示 Verifying…，没有密码框，也没有可点的 Unlink", () => {
    for (const acct of [
      account({ status: "NEEDS_ACTION", reason: "NOT_VERIFIED", classCode: null, verifiedAt: null }),
      account({ status: "NEEDS_ACTION", reason: "BAD_CREDENTIALS", verifying: true }),
    ]) {
      const html = render(AccountCard, acct);
      expect(html).toContain(STRINGS.statusVerifying);
      expect(html).not.toContain('type="password"');
      expect(html).not.toContain(STRINGS.unlinkBtn);
    }
  });

  it("还没拿到账号：加载中，或加载失败的提示", () => {
    expect(render(AccountCard, undefined, false)).toContain(STRINGS.accountLoading);
    const failed = render(AccountCard, undefined, true);
    expect(failed).toContain("reload the page");
    expect(failed).not.toContain('type="password"');
  });

  it("VALID 时卡片什么都不渲染（由 AccountLine 接手）", () => {
    expect(render(AccountCard, account())).toBe("");
  });

  it("页面上没有重新验证按钮", () => {
    for (const acct of [null, account({ status: "NEEDS_ACTION", reason: "CHALLENGE" })]) {
      expect(render(AccountCard, acct)).not.toMatch(/re-verify/i);
    }
  });
});
