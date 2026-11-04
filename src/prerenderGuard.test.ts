import { describe, expect, it, vi } from "vitest";
import { reloadIfSessionChangedOnActivation } from "./prerenderGuard";

// 造一个最小的 target：prerendering 可选，事件派发用 EventTarget
function makeTarget(prerendering?: boolean) {
  return Object.assign(new EventTarget(), prerendering === undefined ? {} : { prerendering });
}

describe("预渲染激活时会话变化", () => {
  it("不是预渲染时不注册监听，之后派发事件也不重载", () => {
    const target = makeTarget(false);
    const reload = vi.fn();
    reloadIfSessionChangedOnActivation(target, () => "a", reload);
    target.dispatchEvent(new Event("prerenderingchange"));
    expect(reload).not.toHaveBeenCalled();
  });

  it("浏览器没有 prerendering 属性时也不重载", () => {
    const target = makeTarget();
    const reload = vi.fn();
    reloadIfSessionChangedOnActivation(target, () => "a", reload);
    target.dispatchEvent(new Event("prerenderingchange"));
    expect(reload).not.toHaveBeenCalled();
  });

  it("预渲染中激活时令牌没变（包括都是 null）则不重载", () => {
    for (const token of ["a", null]) {
      const target = makeTarget(true);
      const reload = vi.fn();
      reloadIfSessionChangedOnActivation(target, () => token, reload);
      target.dispatchEvent(new Event("prerenderingchange"));
      expect(reload).not.toHaveBeenCalled();
    }
  });

  it("预渲染中激活时令牌变了（有到无、无到有、A 到 B）则重载一次", () => {
    const cases: Array<[string | null, string | null]> = [
      ["a", null],
      [null, "b"],
      ["a", "b"],
    ];
    for (const [before, after] of cases) {
      const target = makeTarget(true);
      const reload = vi.fn();
      let token = before;
      reloadIfSessionChangedOnActivation(target, () => token, reload);
      token = after;
      target.dispatchEvent(new Event("prerenderingchange"));
      expect(reload).toHaveBeenCalledTimes(1);
      // once：再派发一次也不再调用
      target.dispatchEvent(new Event("prerenderingchange"));
      expect(reload).toHaveBeenCalledTimes(1);
    }
  });
});
