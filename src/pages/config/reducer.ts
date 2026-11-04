import type { CourseDto, UserDto, WatchConfigDto } from "../../api";
import {
  PLAYERS_DEFAULT, PRICE_DEFAULT, TIME_END_DEFAULT, TIME_START_DEFAULT,
} from "./strings";
import {
  defaultFormCourses, normalizeCourses, normalizeWatch,
  type CourseRef, type WatchView,
} from "./logic";

export interface State {
  offline: boolean;
  user: UserDto | null | undefined; // undefined 表示还在确认是否已登录。null 表示未登录
  courses: CourseRef[];
  watches: WatchView[];
  hitsByWatchId: Record<number, number>; // 来自 /api/matches
  // 展开的卡片 id 列表。按 id 记录多条，不只记一条。这样用户能同时展开多条来对比
  expandedWatchIds: number[];
  formCourses: number[]; // selected course ids (numbers)
  formWeekdays: string[]; // selected weekday codes, e.g. ["SAT","SUN"]
  formTimeStart: string;
  formTimeEnd: string;
  formPlayers: number;
  formMaxPrice: number;
  editingId: number | null;
}

export function createInitialState(): State {
  return {
    offline: false,
    user: undefined,
    courses: [],
    watches: [],
    hitsByWatchId: {},
    expandedWatchIds: [],
    formCourses: [],
    formWeekdays: [], // 星期不给默认值。原因：选哪几天是这条 watch 最重要的决定。预设值容易被用户不加检查地提交
    formTimeStart: TIME_START_DEFAULT,
    formTimeEnd: TIME_END_DEFAULT,
    formPlayers: PLAYERS_DEFAULT,
    formMaxPrice: PRICE_DEFAULT,
    editingId: null,
  };
}

// 表单回到「新建」的默认状态，同时解除编辑锁。
function withFormReset(state: State): State {
  return {
    ...state,
    formCourses: defaultFormCourses(state.courses),
    formWeekdays: [],
    formTimeStart: TIME_START_DEFAULT,
    formTimeEnd: TIME_END_DEFAULT,
    formPlayers: PLAYERS_DEFAULT,
    formMaxPrice: PRICE_DEFAULT,
    editingId: null,
  };
}

// 整页唯一的状态机：一个交互对应一个 action。reducer 收到 action 后算出下一份 state。
// 副作用（请求、toast、滚动到表单）都在 App 层。这里只有纯状态变更。
export type Action =
  | { type: "coursesLoaded"; courses: CourseDto[] }
  | { type: "watchesLoaded"; watches: WatchConfigDto[] }
  | { type: "hitsLoaded"; hits: Record<number, number> }
  | { type: "offline" }
  | { type: "signedIn"; user: UserDto }
  | { type: "signedOut" }
  | { type: "userUpdated"; user: UserDto }
  | { type: "course"; id: number } // 编辑锁和维护拦截在组件层处理
  | { type: "weekday"; code: string }
  | { type: "players"; count: number }
  | { type: "price"; value: number }
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
    case "signedIn":
    case "userUpdated":
      return { ...state, user: action.user };
    case "signedOut":
      // 清空上一个用户的 watch 和表单。
      // 原因：同一台电脑换人登录时，新用户不能看到前一个用户的数据
      return withFormReset({ ...state, user: null, watches: [], hitsByWatchId: {}, expandedWatchIds: [] });
    case "course":
      return {
        ...state,
        formCourses: state.formCourses.includes(action.id)
          ? state.formCourses.filter((selectedId) => selectedId !== action.id)
          : [...state.formCourses, action.id],
      };
    case "weekday":
      // 星期是多选：再点一次已选的星期，取消选择
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
      };
    }
    case "cancel":
      return withFormReset(state);
    case "created":
      // 批量创建：后端为每个球场建一条 watch 并返回数组。新记录插到列表前面
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
      // 正在编辑的 watch 被删除时，重置表单。表单不能停留在一条不存在的记录上
      return state.editingId === action.id ? withFormReset(next) : next;
    }
    case "setWatchActive":
      // 乐观更新和失败回滚共用这个 action：两者都只是把某条 watch 的 active 设为指定值
      return {
        ...state,
        watches: state.watches.map((watch) =>
          watch.id === action.id ? { ...watch, active: action.active } : watch,
        ),
      };
  }
}
