import { describe, it, expect } from "vitest";
import { createInitialState, reducer } from "./reducer";
import type { CourseDto } from "../../api";

const courseDtos: CourseDto[] = [
  { id: 1, slug: "langara", name: "Langara", imageUrl: null, source: "cps", site: "golfvancouver", address: null, rating: 4.3, ratingCount: 100, maintenance: false },
  { id: 2, slug: "riverway", name: "Riverway", imageUrl: null, source: "cps", site: "golfburnaby", address: null, rating: null, ratingCount: null, maintenance: true },
];

const loadedState = () => reducer(createInitialState(), { type: "coursesLoaded", courses: courseDtos });

describe("reducer", () => {
  it("初始态：loading、8 个日期、默认排序 time", () => {
    const state = createInitialState();
    expect(state.loading).toBe(true);
    expect(state.dates).toHaveLength(8);
    expect(state.sortBy).toBe("time");
    expect(state.excludedCourseIds).toEqual([]);
  });
  it("coursesLoaded：维护中的球场进默认排除名单", () => {
    expect(loadedState().excludedCourseIds).toEqual(["riverway"]);
  });
  it("date：切日期清掉选中的时段 chip", () => {
    const state = reducer({ ...loadedState(), selectedChip: "langara|07:00" }, { type: "date", index: 3 });
    expect(state.selectedDateIndex).toBe(3);
    expect(state.selectedChip).toBeNull();
  });
  it("filter：开合翻转", () => {
    expect(reducer(loadedState(), { type: "filter" }).filterOpen).toBe(true);
  });
  it("course：排除/取消排除来回切", () => {
    let state = reducer(loadedState(), { type: "course", id: "langara" });
    expect(state.excludedCourseIds).toContain("langara");
    state = reducer(state, { type: "course", id: "langara" });
    expect(state.excludedCourseIds).not.toContain("langara");
  });
  it("reset：回到「维护中排除在外」的默认态，不是清空", () => {
    let state = reducer(loadedState(), { type: "course", id: "langara" });
    state = reducer(state, { type: "price", value: "top" });
    state = reducer(state, { type: "sort", value: "rec" });
    state = reducer(state, { type: "reset" });
    expect(state.excludedCourseIds).toEqual(["riverway"]);
    expect(state.priceBucket).toBe("all");
    expect(state.sortBy).toBe("time");
  });
  it("chip：同一个 key 再点一次取消", () => {
    let state = reducer(loadedState(), { type: "chip", key: "a|07:00" });
    expect(state.selectedChip).toBe("a|07:00");
    state = reducer(state, { type: "chip", key: "a|07:00" });
    expect(state.selectedChip).toBeNull();
  });
  it("loadStart/dayLoaded：分组挂上 courses 元数据并结束 loading", () => {
    let state = reducer(loadedState(), { type: "loadStart" });
    expect(state.loading).toBe(true);
    state = reducer(state, {
      type: "dayLoaded",
      teeTimeList: [{ courseId: "langara", course: "Langara", time: "07:00", price: 63, availableSeats: 2 }],
    });
    expect(state.loading).toBe(false);
    expect(state.dayData[0].rating).toBe(4.3);
  });
  it("dayFailed：清空数据、标 offline、结束 loading（绝不编造数据）", () => {
    const state = reducer(reducer(loadedState(), { type: "loadStart" }), { type: "dayFailed" });
    expect(state).toMatchObject({ offline: true, dayData: [], loading: false });
  });
});
