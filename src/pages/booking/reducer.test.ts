import { describe, it, expect } from "vitest";
import { createInitialState, reducer, type BookingState } from "./reducer";
import type { BookingTaskDto, CourseDto, UserDto } from "../../api";

// 测试数据只用 example.test 这类假域名，公开仓库里不放任何真实地址。
const task = (over: Partial<BookingTaskDto> = {}): BookingTaskDto => ({
  id: 1, courseId: 9, courseSlug: "northlands", courseName: "Northlands",
  playDate: "2026-11-08", runAt: "2026-11-03T14:00:00Z", runAtLocal: "2026-11-03T07:00",
  timeStart: "08:00", timeEnd: "10:00", players: 2, maxPrice: 100, sort: "EARLIEST",
  status: "PENDING", resultDetail: null, createdAt: "2026-11-02T20:00:00Z", finishedAt: null,
  creatorLoginEmail: "a@example.test", mine: true, cancellable: true, bookingAccountEmail: null,
  ...over,
});

const user = (over: Partial<UserDto> = {}): UserDto => ({
  id: 1, loginEmail: "a@example.test", displayName: null, notifyEmail: "a@example.test",
  notificationsEnabled: true, admin: false, googleLinked: false, enableAutoBooking: true,
  ...over,
});

const course: CourseDto = {
  id: 9, slug: "northlands", name: "Northlands", imageUrl: null, source: "cps", site: "northlands",
  address: null, rating: null, ratingCount: null, maintenance: false,
};

// 2026-11-03T06:30Z 在温哥华仍是 11-02 晚上，缺省运行日 = 11-03
const NOW = new Date("2026-11-03T06:30:00Z");
const fresh = (): BookingState => createInitialState(NOW);

describe("booking reducer", () => {
  it("初始态：还在确认登录态、在加载、表单是缺省值", () => {
    const state = fresh();
    expect(state.user).toBeUndefined();
    expect(state.loading).toBe(true);
    expect(state.scheduled).toEqual([]);
    expect(state.mine).toEqual([]);
    expect(state.form.runDate).toBe("2026-11-03");
    expect(state.form.runTime).toBe("07:00");
    expect(state.form.playDate).toBe("2026-11-08");
    expect(state.form.sort).toBe("EARLIEST");
  });

  it("userLoaded：能看订场的用户继续加载列表；看不到的不加载", () => {
    expect(reducer(fresh(), { type: "userLoaded", user: user() }).loading).toBe(true);
    expect(reducer(fresh(), { type: "userLoaded", user: user({ admin: true, enableAutoBooking: false }) }).loading).toBe(true);
    const hidden = reducer(fresh(), { type: "userLoaded", user: user({ enableAutoBooking: false }) });
    expect(hidden.user?.enableAutoBooking).toBe(false);
    expect(hidden.loading).toBe(false);
  });

  it("tasksLoaded：整体替换两个列表并结束加载", () => {
    let state = reducer(fresh(), { type: "tasksLoaded", scheduled: [task({ id: 1 })], mine: [task({ id: 1 })] });
    state = reducer(state, { type: "tasksLoaded", scheduled: [task({ id: 2 })], mine: [task({ id: 3 }), task({ id: 2 })] });
    expect(state.scheduled.map((item) => item.id)).toEqual([2]);
    expect(state.mine.map((item) => item.id)).toEqual([3, 2]);
    expect(state.loading).toBe(false);
  });

  it("taskCreated：以服务端返回为准，进 mine 的最前面，活动态的也进 scheduled（按运行时间升序）", () => {
    let state = reducer(fresh(), {
      type: "tasksLoaded",
      scheduled: [task({ id: 5, runAt: "2026-11-04T14:00:00Z", runAtLocal: "2026-11-04T07:00", creatorLoginEmail: "b@example.test", mine: false })],
      mine: [task({ id: 4, status: "BOOKED", cancellable: false })],
    });
    state = reducer(state, { type: "taskCreated", task: task({ id: 6, runAt: "2026-11-03T14:00:00Z" }) });
    expect(state.mine.map((item) => item.id)).toEqual([6, 4]);
    expect(state.scheduled.map((item) => item.id)).toEqual([6, 5]);
  });

  it("taskCreated：同一个 id 重复到达只替换不重复", () => {
    let state = reducer(fresh(), { type: "taskCreated", task: task({ id: 6 }) });
    state = reducer(state, { type: "taskCreated", task: task({ id: 6, bookingAccountEmail: "acct@example.test" }) });
    expect(state.mine).toHaveLength(1);
    expect(state.scheduled).toHaveLength(1);
    expect(state.scheduled[0].bookingAccountEmail).toBe("acct@example.test");
  });

  it("taskCancelled：mine 里换成服务端返回的 CANCELLED，scheduled 里移除", () => {
    let state = reducer(fresh(), {
      type: "tasksLoaded",
      scheduled: [task({ id: 1 }), task({ id: 2, runAt: "2026-11-04T14:00:00Z" })],
      mine: [task({ id: 2 }), task({ id: 1 })],
    });
    state = reducer(state, { type: "taskCancelled", task: task({ id: 1, status: "CANCELLED", cancellable: false }) });
    expect(state.scheduled.map((item) => item.id)).toEqual([2]);
    expect(state.mine.map((item) => item.id)).toEqual([2, 1]);
    expect(state.mine.find((item) => item.id === 1)?.status).toBe("CANCELLED");
  });

  it("错误类 action 只设置 toast，不清空列表", () => {
    const loaded = reducer(fresh(), { type: "tasksLoaded", scheduled: [task({ id: 1 })], mine: [task({ id: 1 })] });
    const toasted = reducer(loaded, { type: "toast", message: "nope" });
    expect(toasted.toast).toBe("nope");
    expect(toasted.scheduled).toHaveLength(1);
    expect(toasted.mine).toHaveLength(1);
    const offline = reducer(loaded, { type: "offline" });
    expect(offline.offline).toBe(true);
    expect(offline.toast).not.toBe("");
    expect(offline.scheduled).toHaveLength(1);
    expect(reducer(toasted, { type: "toast", message: "" }).toast).toBe("");
  });

  it("loadFailed：结束加载但不动列表", () => {
    const state = reducer(fresh(), { type: "loadFailed" });
    expect(state.loading).toBe(false);
  });

  it("signedOut：清掉上一个人的任务与登录态", () => {
    let state = reducer(fresh(), { type: "userLoaded", user: user() });
    state = reducer(state, { type: "tasksLoaded", scheduled: [task()], mine: [task()] });
    state = reducer(state, { type: "signedOut" });
    expect(state.user).toBeNull();
    expect(state.scheduled).toEqual([]);
    expect(state.mine).toEqual([]);
    expect(state.loading).toBe(false);
  });

  it("coursesLoaded 存下球场清单", () => {
    expect(reducer(fresh(), { type: "coursesLoaded", courses: [course] }).courses).toEqual([course]);
  });

  it("formChanged：改运行日时打球日没被手动改过就跟着 +5 天；手动改过后不再跟", () => {
    let state = reducer(fresh(), { type: "formChanged", patch: { runDate: "2026-11-10" } });
    expect(state.form.playDate).toBe("2026-11-15");
    state = reducer(state, { type: "formChanged", patch: { playDate: "2026-11-12" } });
    expect(state.form.playDate).toBe("2026-11-12");
    expect(state.form.playDateTouched).toBe(true);
    state = reducer(state, { type: "formChanged", patch: { runDate: "2026-11-20" } });
    expect(state.form.playDate).toBe("2026-11-12");
  });

  it("formChanged：其它字段各自更新，不影响列表", () => {
    const state = reducer(fresh(), { type: "formChanged", patch: { players: 3, maxPrice: 120, sort: "CHEAPEST", timeStart: "09:00" } });
    expect(state.form).toMatchObject({ players: 3, maxPrice: 120, sort: "CHEAPEST", timeStart: "09:00" });
  });
});
