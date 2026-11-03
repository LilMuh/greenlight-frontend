import type { BookingSort, BookingTaskDto, CourseDto, UserDto } from "../../api";
import { PLAYERS_DEFAULT, TIME_END_DEFAULT, TIME_START_DEFAULT } from "../config/strings";
import { canSeeBooking, defaultPlayDate, defaultRunAt } from "./logic";
import { STRINGS } from "./strings";

/** 建任务表单的字段。运行时间拆成「日期 + 时刻」两个控件，提交时才拼成 runAtLocal。 */
export interface BookingForm {
  runDate: string; // yyyy-MM-dd，站点本地
  runTime: string; // HH:mm，站点本地
  playDate: string; // yyyy-MM-dd
  // 打球日是否被手动改过：没改过就跟着运行日走（运行日 + 5 天），改过就不再替人覆盖
  playDateTouched: boolean;
  timeStart: string;
  timeEnd: string;
  players: number;
  maxPrice: number;
  sort: BookingSort;
}

/** formChanged 的补丁：playDateTouched 由 reducer 自己维护，调用方不能直接改。 */
export type BookingFormPatch = Partial<Omit<BookingForm, "playDateTouched">>;

export interface BookingState {
  offline: boolean;
  user: UserDto | null | undefined; // undefined = 还在确认登录态；null = 没登录
  courses: CourseDto[];
  scheduled: BookingTaskDto[]; // 所有人的 PENDING / RUNNING，运行时间升序
  mine: BookingTaskDto[]; // 自己的全部（管理员是所有人的），id 降序
  loading: boolean; // 列表还没拿到
  toast: string; // 空串 = 不显示
  form: BookingForm;
}

// 单人价缺省值：没有可参考的行情数据，取一个中间值让人自己改，不是推荐价
export const PRICE_DEFAULT = 100;

export function createInitialState(now: Date): BookingState {
  const run = defaultRunAt(now);
  return {
    offline: false,
    user: undefined,
    courses: [],
    scheduled: [],
    mine: [],
    loading: true,
    toast: "",
    form: {
      runDate: run.date,
      runTime: run.time,
      playDate: defaultPlayDate(run.date),
      playDateTouched: false,
      timeStart: TIME_START_DEFAULT,
      timeEnd: TIME_END_DEFAULT,
      players: PLAYERS_DEFAULT,
      maxPrice: PRICE_DEFAULT,
      sort: "EARLIEST",
    },
  };
}

// 整页唯一的状态机：一个交互 = 一个 action。副作用（请求、toast 计时、确认框）都在 App 层。
export type BookingAction =
  | { type: "coursesLoaded"; courses: CourseDto[] }
  | { type: "userLoaded"; user: UserDto }
  | { type: "signedOut" }
  | { type: "tasksLoaded"; scheduled: BookingTaskDto[]; mine: BookingTaskDto[] }
  | { type: "loadFailed" } // 列表没拿到：只结束「加载中」，已有的列表原样保留
  | { type: "taskCreated"; task: BookingTaskDto }
  | { type: "taskCancelled"; task: BookingTaskDto }
  | { type: "formChanged"; patch: BookingFormPatch }
  | { type: "toast"; message: string }
  | { type: "offline" };

const isActive = (task: BookingTaskDto) => task.status === "PENDING" || task.status === "RUNNING";
const runAtMs = (task: BookingTaskDto) => Date.parse(task.runAt);

// 以服务端返回的这一条为准：替换同 id 的旧条目（没有就新增），再按各自的顺序排好
function upsert(state: BookingState, task: BookingTaskDto): Pick<BookingState, "scheduled" | "mine"> {
  const others = (list: BookingTaskDto[]) => list.filter((item) => item.id !== task.id);
  const mine = [task, ...others(state.mine)].sort((left, right) => right.id - left.id);
  const scheduled = (isActive(task) ? [task, ...others(state.scheduled)] : others(state.scheduled))
    .sort((left, right) => runAtMs(left) - runAtMs(right));
  return { mine, scheduled };
}

export function reducer(state: BookingState, action: BookingAction): BookingState {
  switch (action.type) {
    case "coursesLoaded":
      return { ...state, courses: action.courses };
    case "userLoaded":
      // 看不到订场的人不会去拉列表，别让他卡在「加载中」
      return { ...state, user: action.user, loading: canSeeBooking(action.user) };
    case "signedOut":
      // 上一个人的任务不留：同一台电脑换人登录不能看到前一个人的东西
      return { ...state, user: null, scheduled: [], mine: [], loading: false };
    case "tasksLoaded":
      return { ...state, scheduled: action.scheduled, mine: action.mine, loading: false };
    case "loadFailed":
      return { ...state, loading: false };
    case "taskCreated":
    case "taskCancelled":
      return { ...state, ...upsert(state, action.task) };
    case "formChanged": {
      const form = { ...state.form, ...action.patch };
      if (action.patch.playDate !== undefined) form.playDateTouched = true;
      else if (action.patch.runDate && !form.playDateTouched) form.playDate = defaultPlayDate(action.patch.runDate);
      return { ...state, form };
    }
    case "toast":
      return { ...state, toast: action.message };
    case "offline":
      return { ...state, offline: true, toast: STRINGS.offline };
  }
}
