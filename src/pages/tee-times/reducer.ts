import type { CourseDto, TeeTimeDto } from "../../api";
import { SORT_DEFAULT, type PriceBucket, type SortBy } from "./strings";
import {
  buildDates, groupTeeTimes, maintenanceCourseIds, normalizeCourses,
  type CourseDay, type CourseView,
} from "./logic";

export interface State {
  offline: boolean; // 有过一次加载失败；只决定 init 时要不要弹失败 toast
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

// 整页唯一的状态机：一个用户交互 = 一个 action，reducer 收到后算出下一份 state。
// 副作用（请求、toast）都在 App 层；维护中球场点击的拦截也在那边做。
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
      // Reset 回到默认，而默认就包含「维护中的排除在外」，不是清空
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
      // 维护中的球场默认排除：时段早就停更了，混在结果里只会让人对着过期数据点 Book
      return { ...state, courses, excludedCourseIds: maintenanceCourseIds(courses) };
    }
    case "loadStart":
      return { ...state, loading: true };
    case "dayLoaded":
      // 分组要用 state.courses 挂元数据，所以放这里做而不是 App 里
      return { ...state, dayData: groupTeeTimes(action.teeTimeList, state.courses), loading: false };
    case "failure":
      return { ...state, offline: true };
    case "dayFailed":
      // 拿不到就什么都不显示，绝不编造
      return { ...state, offline: true, dayData: [], loading: false };
  }
}
