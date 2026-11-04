import type { CourseDto, TeeTimeDto } from "../../api";
import { SORT_DEFAULT, type PriceBucket, type SortBy } from "./strings";
import {
  buildDates, groupTeeTimes, maintenanceCourseIds, normalizeCourses,
  type CourseDay, type CourseView,
} from "./logic";

export interface State {
  offline: boolean; // 是否有过加载失败。它只决定 init 时是否弹出失败 toast
  loading: boolean;
  courses: CourseView[];
  dayData: CourseDay[];
  dates: { date: Date; iso: string }[];
  selectedDateIndex: number;
  filterOpen: boolean;
  priceBucket: PriceBucket;
  excludedCourseIds: string[];
  sortBy: SortBy;
  selectedChip: string | null;
}

export function createInitialState(): State {
  return {
    offline: false,
    loading: true,
    courses: [],
    dayData: [],
    dates: buildDates(),
    selectedDateIndex: 0,
    filterOpen: false,
    priceBucket: "all",
    excludedCourseIds: [],
    sortBy: SORT_DEFAULT,
    selectedChip: null,
  };
}

// 整页唯一的状态机：一个用户交互对应一个 action。reducer 收到 action 后算出下一份 state。
// 副作用（请求、toast）都在 App 层处理。拦截维护中球场的点击也在 App 层。
export type Action =
  | { type: "date"; index: number }
  | { type: "filter" }
  | { type: "reset" }
  | { type: "course"; id: string }
  | { type: "price"; value: PriceBucket }
  | { type: "sort"; value: SortBy }
  | { type: "chip"; key: string }
  | { type: "coursesLoaded"; courses: CourseDto[] }
  | { type: "loadStart" }
  | { type: "dayLoaded"; teeTimeList: TeeTimeDto[] }
  | { type: "failure" }
  | { type: "dayFailed" };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "date":
      return { ...state, selectedDateIndex: action.index, selectedChip: null };
    case "filter":
      return { ...state, filterOpen: !state.filterOpen };
    case "reset":
      // Reset 回到默认值，不是清空。默认值本身就排除维护中的球场
      return {
        ...state,
        priceBucket: "all",
        sortBy: SORT_DEFAULT,
        excludedCourseIds: maintenanceCourseIds(state.courses),
      };
    case "course":
      return {
        ...state,
        excludedCourseIds: state.excludedCourseIds.includes(action.id)
          ? state.excludedCourseIds.filter((excludedId) => excludedId !== action.id)
          : [...state.excludedCourseIds, action.id],
      };
    case "price":
      return { ...state, priceBucket: action.value };
    case "sort":
      return { ...state, sortBy: action.value };
    case "chip":
      return { ...state, selectedChip: state.selectedChip === action.key ? null : action.key };
    case "coursesLoaded": {
      const courses = normalizeCourses(action.courses);
      // 维护中的球场默认排除。
      // 原因：它们的时段早已停止更新。留在结果里，用户会对着过期数据点 Book
      return { ...state, courses, excludedCourseIds: maintenanceCourseIds(courses) };
    }
    case "loadStart":
      return { ...state, loading: true };
    case "dayLoaded":
      // 分组要用 state.courses 挂元数据，因此在 reducer 里做，不在 App 里做
      return { ...state, dayData: groupTeeTimes(action.teeTimeList, state.courses), loading: false };
    case "failure":
      return { ...state, offline: true };
    case "dayFailed":
      // 拿不到数据时什么都不显示。不要编造数据
      return { ...state, offline: true, dayData: [], loading: false };
  }
}
