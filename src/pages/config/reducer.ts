import type { CourseDto, WatchConfigDto } from "../../api";
import {
  PLAYERS_DEFAULT, PRICE_DEFAULT, TIME_END_DEFAULT, TIME_START_DEFAULT,
} from "./strings";
import {
  defaultFormCourses, normalizeCourses, normalizeWatch,
  type CourseRef, type WatchView,
} from "./logic";

export interface State {
  offline: boolean;
  courses: CourseRef[];
  watches: WatchView[];
  hitsByWatchId: Record<number, number>; // 来自 /api/matches
  // 展开的卡片 id。默认全部折叠：一条 watch 平时只需要认出「哪个球场、发给谁」，
  // 星期/时段/人数/价格是设置它的时候才看的东西。按 id 记而不是记一个「当前展开的」，
  // 是为了允许同时展开多条对比。
  expandedWatchIds: number[];
  formCourses: number[]; // selected course ids (numbers)
  formWeekdays: string[]; // selected weekday codes, e.g. ["SAT","SUN"]
  formTimeStart: string;
  formTimeEnd: string;
  formPlayers: number;
  formMaxPrice: number;
  formEmail: string;
  editingId: number | null;
}

export function createInitialState(): State {
  return {
    offline: false,
    courses: [],
    watches: [],
    hitsByWatchId: {},
    expandedWatchIds: [],
    formCourses: [],
    formWeekdays: [], // 星期不给默认值：勾哪几天是这条 watch 最要紧的决定，替人预设只会被将错就错地提交
    formTimeStart: TIME_START_DEFAULT,
    formTimeEnd: TIME_END_DEFAULT,
    formPlayers: PLAYERS_DEFAULT,
    formMaxPrice: PRICE_DEFAULT,
    formEmail: "",
    editingId: null,
  };
}

// 表单回到「新建」的默认态（编辑锁一并解除）。
function withFormReset(state: State): State {
  return {
    ...state,
    formCourses: defaultFormCourses(state.courses),
    formWeekdays: [],
    formTimeStart: TIME_START_DEFAULT,
    formTimeEnd: TIME_END_DEFAULT,
    formPlayers: PLAYERS_DEFAULT,
    formMaxPrice: PRICE_DEFAULT,
    formEmail: "",
    editingId: null,
  };
}

// 整页唯一的状态机：一个交互 = 一个 action，reducer 收到后算出下一份 state。
// 副作用（请求、toast、滚动到表单）都在 App 层；这里只有纯状态变更。
export type Action =
  | { type: "coursesLoaded"; courses: CourseDto[] }
  | { type: "watchesLoaded"; watches: WatchConfigDto[] }
  | { type: "hitsLoaded"; hits: Record<number, number> }
  | { type: "offline" }
  | { type: "course"; id: number } // 编辑锁/维护拦截在组件层
  | { type: "weekday"; code: string }
  | { type: "players"; count: number }
  | { type: "price"; value: number }
  | { type: "email"; value: string }
  | { type: "time"; which: "start" | "end"; value: string }
  | { type: "expand"; id: number }
  | { type: "edit"; id: number }
  | { type: "cancel" }
  | { type: "created"; watches: WatchConfigDto[] }
  | { type: "updated"; watch: WatchConfigDto }
  | { type: "deleted"; id: number }
  | { type: "setWatchActive"; id: number; active: boolean };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "coursesLoaded": {
      const courses = normalizeCourses(action.courses);
      return { ...state, courses, formCourses: defaultFormCourses(courses) };
    }
    case "watchesLoaded":
      return { ...state, watches: action.watches.map((record) => normalizeWatch(record, state.courses)) };
    case "hitsLoaded":
      return { ...state, hitsByWatchId: action.hits };
    case "offline":
      return { ...state, offline: true };
    case "course":
      return {
        ...state,
        formCourses: state.formCourses.includes(action.id)
          ? state.formCourses.filter((selectedId) => selectedId !== action.id)
          : [...state.formCourses, action.id],
      };
    case "weekday":
      // 星期是多选：勾中的再点一次取消
      return {
        ...state,
        formWeekdays: state.formWeekdays.includes(action.code)
          ? state.formWeekdays.filter((selected) => selected !== action.code)
          : [...state.formWeekdays, action.code],
      };
    case "players":
      return { ...state, formPlayers: action.count };
    case "price":
      return { ...state, formMaxPrice: action.value };
    case "email":
      return { ...state, formEmail: action.value };
    case "time":
      return action.which === "start"
        ? { ...state, formTimeStart: action.value }
        : { ...state, formTimeEnd: action.value };
    case "expand":
      return {
        ...state,
        expandedWatchIds: state.expandedWatchIds.includes(action.id)
          ? state.expandedWatchIds.filter((expandedId) => expandedId !== action.id)
          : [...state.expandedWatchIds, action.id],
      };
    case "edit": {
      const watch = state.watches.find((candidate) => candidate.id === action.id);
      if (!watch) return state;
      return {
        ...state,
        editingId: watch.id,
        formCourses: [watch.courseId],
        formWeekdays: [...watch.weekdays],
        formTimeStart: watch.timeStart,
        formTimeEnd: watch.timeEnd,
        formPlayers: watch.players,
        formMaxPrice: watch.maxPrice,
        formEmail: watch.email,
      };
    }
    case "cancel":
      return withFormReset(state);
    case "created":
      // 批量创建：后端逐球场建一条，返回数组，前插到列表
      return withFormReset({
        ...state,
        watches: [...action.watches.map((record) => normalizeWatch(record, state.courses)), ...state.watches],
      });
    case "updated":
      return withFormReset({
        ...state,
        watches: state.watches.map((watch) =>
          watch.id === action.watch.id ? normalizeWatch(action.watch, state.courses) : watch,
        ),
      });
    case "deleted": {
      const next = { ...state, watches: state.watches.filter((watch) => watch.id !== action.id) };
      // 正在编辑的那条被删了，表单不能停在一条不存在的记录上
      return state.editingId === action.id ? withFormReset(next) : next;
    }
    case "setWatchActive":
      // 乐观更新与失败回滚共用：都只是把某条的 active 写成指定值
      return {
        ...state,
        watches: state.watches.map((watch) =>
          watch.id === action.id ? { ...watch, active: action.active } : watch,
        ),
      };
  }
}
