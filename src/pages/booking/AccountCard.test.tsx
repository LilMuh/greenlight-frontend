// 账号卡片的 SSR 冒烟（D-18）：vitest 的环境是 node，没有 jsdom，所以用 react-dom/server 的 renderToStaticMarkup
// 渲染各状态，按标记字符串断言。effect 在 SSR 不执行（不会发请求、不会轮询），回调传空函数即可。
// 测试数据只用 .invalid 这类假域名，公开仓库里不放任何真实地址。
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BookingAccountDto, UserDto } from "../../api";
import { AccountCard, AccountChip } from "./AccountCard";
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
  Component: typeof AccountCard | typeof AccountChip,
  acct: BookingAccountDto | null | undefined,
  loadFailed = false,
) =>
  renderToStaticMarkup(
    <Component user={user()} account={acct} loadFailed={loadFailed} onAccountChange={noop} onSignedOut={noop} onUnlinked={noop} />,
  );
// renderToStaticMarkup 会转义单引号，文案里带撇号时按转义后的形式比较
const escaped = (text: string) => text.replaceAll("&", "&amp;").replaceAll("'", "&#x27;");

describe("AccountChip（绑定后的小卡片：Booking account 标签、邮箱 · 状态 · Unlink）", () => {
  it("OWN VALID：标签、邮箱、Valid、Unlink；没有密码框、改密码与 Re-verify", () => {
    const html = render(AccountChip, account());
    expect(html).toContain(STRINGS.accountTitle);
    expect(html).toContain(EMAIL);
    expect(html).toContain(STRINGS.statusValid);
    expect(html).toContain(STRINGS.unlinkBtn);
    expect(html).not.toContain('type="password"');
    expect(html).not.toMatch(/change password|re-verify/i);
    expect(html).not.toContain("disabled");
  });

  it("SHARED：显示 Shared 而不是 Valid", () => {
    const html = render(AccountChip, account({ kind: "SHARED" }));
    expect(html).toContain(STRINGS.statusShared);
    expect(html).not.toContain(`>${STRINGS.statusValid}<`);
  });

  it("验证中：Verifying… 与进度小字，Unlink 不可点", () => {
    const html = render(AccountChip, account({ verifying: true }));
    expect(html).toContain(STRINGS.statusVerifying);
    expect(html).toContain(STRINGS.accountVerifying);
    expect(html.match(/disabled=""/g)).toHaveLength(1);
  });

  it("BAD_CREDENTIALS：Invalid、提示 Unlink 后重新绑定的中文小字、可点的 Unlink，没有密码框", () => {
    const html = render(AccountChip, account({ status: "NEEDS_ACTION", reason: "BAD_CREDENTIALS", classCode: null, verifiedAt: null }));
    expect(html).toContain(STRINGS.statusInvalid);
    expect(html).toContain("is-acct-invalid");
    expect(html).toContain("密码错误，需要 Unlink 后重新绑定。");
    expect(html).toContain(STRINGS.unlinkBtn);
    expect(html).not.toContain("disabled");
    expect(html).not.toContain('type="password"');
  });

  it("CHALLENGE：Invalid 并提示联系管理员带原因码", () => {
    const html = render(AccountChip, account({ status: "NEEDS_ACTION", reason: "CHALLENGE", classCode: null, verifiedAt: null }));
    expect(html).toContain(STRINGS.statusInvalid);
    expect(html).toContain("请联系管理员（原因：CHALLENGE）。");
  });

  it("容器是带名字的 section，邮箱不是链接", () => {
    const html = render(AccountChip, account());
    expect(html).toContain(`aria-label="${STRINGS.accountTitle}"`);
    expect(html).not.toContain("<a ");
  });

  it("没有账号记录时什么都不渲染", () => {
    expect(render(AccountChip, null)).toBe("");
  });

  it("首次渲染没有确认框，也不用浏览器弹窗确认", () => {
    expect(render(AccountChip, account())).not.toContain("<dialog");
    expect(STRINGS).not.toHaveProperty("unlinkConfirm");
  });
});

describe("AccountCard（没有 VALID 账号时占表单位置）", () => {
  it("未绑定：Booking account 标签、邮箱与密码输入、Link account 与去绑定才能建任务的提示", () => {
    const html = render(AccountCard, null);
    expect(html).toContain("wa-bk-acct is-compact");
    expect(html).toContain(STRINGS.accountTitle);
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain(STRINGS.linkBtn);
    expect(html).toContain(escaped(STRINGS.createNeedsLink));
    expect(html).not.toContain("readOnly");
  });

  it("已有记录（Invalid / 验证中）：换成小卡片，没有密码框", () => {
    for (const acct of [
      account({ status: "NEEDS_ACTION", reason: "BAD_CREDENTIALS", classCode: null, verifiedAt: null }),
      account({ status: "NEEDS_ACTION", reason: "NOT_VERIFIED", classCode: null, verifiedAt: null }),
      account({ status: "NEEDS_ACTION", reason: "BAD_CREDENTIALS", verifying: true }),
    ]) {
      const html = render(AccountCard, acct);
      expect(html).toContain("wa-bk-chip");
      expect(html).not.toContain('type="password"');
    }
  });

  it("还没拿到账号：加载中，或加载失败的提示", () => {
    expect(render(AccountCard, undefined, false)).toContain(STRINGS.accountLoading);
    const failed = render(AccountCard, undefined, true);
    expect(failed).toContain("reload the page");
    expect(failed).not.toContain('type="password"');
  });

  it("VALID 时什么都不渲染（小卡片在任务列表上方）", () => {
    expect(render(AccountCard, account())).toBe("");
  });

  it("页面上没有重新验证按钮", () => {
    for (const acct of [null, account({ status: "NEEDS_ACTION", reason: "CHALLENGE" })]) {
      expect(render(AccountCard, acct)).not.toMatch(/re-verify/i);
    }
  });
});
