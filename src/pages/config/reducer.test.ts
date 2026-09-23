import { describe, it, expect } from "vitest";
import { createInitialState, reducer, type State } from "./reducer";
import type { CourseDto, UserDto, WatchConfigDto } from "../../api";

const courseDtos: CourseDto[] = [
  { id: 1, slug: "langara", name: "Langara Golf Course", imageUrl: null, source: "cps", site: "golfvancouver", address: null, rating: null, ratingCount: null, maintenance: false },
  { id: 2, slug: "riverway", name: "Riverway Golf Course", imageUrl: null, source: "cps", site: "golfburnaby", address: null, rating: null, ratingCount: null, maintenance: true },
];

const watchDto = (over: Partial<WatchConfigDto> = {}): WatchConfigDto => ({
  id: 7, courseId: 1, courseName: "Langara Golf Course", weekdays: ["SAT"],
  timeStart: "08:00", timeEnd: "12:00", players: 2, maxPrice: 80,
  active: true, ...over,
});

const loaded = (): State => {
  let state = reducer(createInitialState(), { type: "coursesLoaded", courses: courseDtos });
  state = reducer(state, { type: "watchesLoaded", watches: [watchDto()] });
  return state;
};

describe("config reducer", () => {
  it("初始态：表单默认值、星期为空", () => {
    const state = createInitialState();
    expect(state.formWeekdays).toEqual([]);
    expect(state.formTimeStart).toBe("06:00");
    expect(state.formPlayers).toBe(4);
    expect(state.formMaxPrice).toBe(300);
    expect(state.editingId).toBeNull();
  });
  it("coursesLoaded：表单默认全选但排除维护中球场", () => {
    const state = reducer(createInitialState(), { type: "coursesLoaded", courses: courseDtos });
    expect(state.formCourses).toEqual([1]);
  });
  it("course/weekday/players/price/time 各自更新表单", () => {
    let state = loaded();
    state = reducer(state, { type: "course", id: 1 }); // 已选中 -> 取消
    expect(state.formCourses).toEqual([]);
    state = reducer(state, { type: "weekday", code: "SAT" });
    expect(state.formWeekdays).toEqual(["SAT"]);
    state = reducer(state, { type: "weekday", code: "SAT" }); // 再点取消
    expect(state.formWeekdays).toEqual([]);
    state = reducer(state, { type: "players", count: 2 });
    state = reducer(state, { type: "price", value: 120 });
    state = reducer(state, { type: "time", which: "end", value: "18:30" });
    expect(state).toMatchObject({ formPlayers: 2, formMaxPrice: 120, formTimeEnd: "18:30" });
  });
  it("edit：表单载入该 watch；cancel：回默认态（星期清空、editingId 清掉）", () => {
    let state = reducer(loaded(), { type: "edit", id: 7 });
    expect(state.editingId).toBe(7);
    expect(state.formCourses).toEqual([1]);
    expect(state.formWeekdays).toEqual(["SAT"]);
    state = reducer(state, { type: "cancel" });
    expect(state.editingId).toBeNull();
    expect(state.formWeekdays).toEqual([]);
    expect(state.formCourses).toEqual([1]); // 默认全选（排除维护中）
  });
  it("created：前插并重置表单", () => {
    let state = reducer(loaded(), { type: "players", count: 1 });
    state = reducer(state, { type: "created", watches: [watchDto({ id: 8, courseId: 1 })] });
    expect(state.watches.map((watch) => watch.id)).toEqual([8, 7]);
    expect(state.formPlayers).toBe(4);
  });
  it("updated：原位替换并重置表单", () => {
    let state = reducer(loaded(), { type: "edit", id: 7 });
    state = reducer(state, { type: "updated", watch: watchDto({ maxPrice: 150 }) });
    expect(state.watches[0].maxPrice).toBe(150);
    expect(state.editingId).toBeNull();
  });
  it("deleted：过滤；恰好在编辑这条则重置表单", () => {
    let state = reducer(loaded(), { type: "edit", id: 7 });
    state = reducer(state, { type: "deleted", id: 7 });
    expect(state.watches).toEqual([]);
    expect(state.editingId).toBeNull();
  });
  it("expand：展开集合按 id 增删，可同时展开多条", () => {
    let state = reducer(loaded(), { type: "expand", id: 7 });
    expect(state.expandedWatchIds).toEqual([7]);
    state = reducer(state, { type: "expand", id: 7 });
    expect(state.expandedWatchIds).toEqual([]);
  });
  it("setWatchActive：只翻指定条目（乐观更新与回滚共用）", () => {
    const state = reducer(loaded(), { type: "setWatchActive", id: 7, active: false });
    expect(state.watches[0].active).toBe(false);
  });
  it("hitsLoaded / offline", () => {
    let state = reducer(loaded(), { type: "hitsLoaded", hits: { 7: 3 } });
    expect(state.hitsByWatchId[7]).toBe(3);
    state = reducer(state, { type: "offline" });
    expect(state.offline).toBe(true);
  });
  it("初始登录态未知；signedIn / userUpdated 记下账号", () => {
    expect(createInitialState().user).toBeUndefined();
    let state = reducer(loaded(), { type: "signedIn", user });
    expect(state.user).toEqual(user);
    state = reducer(state, { type: "userUpdated", user: { ...user, notifyEmail: "alerts@b.c" } });
    expect(state.user?.notifyEmail).toBe("alerts@b.c");
  });
  it("signedOut：清掉上一个人的 watch、命中数和编辑中的表单，球场清单保留", () => {
    let state = reducer(loaded(), { type: "signedIn", user });
    state = reducer(state, { type: "hitsLoaded", hits: { 7: 3 } });
    state = reducer(state, { type: "edit", id: 7 });
    state = reducer(state, { type: "signedOut" });
    expect(state.user).toBeNull();
    expect(state.watches).toEqual([]);
    expect(state.hitsByWatchId).toEqual({});
    expect(state.editingId).toBeNull();
    expect(state.courses).toHaveLength(2);
  });
});

const user: UserDto = {
  id: 1, loginEmail: "a@b.c", displayName: null, notifyEmail: "a@b.c",
  notificationsEnabled: true, admin: false, googleLinked: false,
};
