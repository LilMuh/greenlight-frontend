import type { BookingAccountDto, BookingSort, BookingTaskDto, CourseDto, UserDto } from "../../api";
import { PLAYERS_DEFAULT, TIME_END_DEFAULT, TIME_START_DEFAULT } from "../config/strings";
import { canSeeBooking, defaultPlayDate, defaultRunAt, runParts } from "./logic";
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
  scheduled: BookingTaskDto[]; // 普通用户是自己的 PENDING / RUNNING、管理员是所有人的（D-14），运行时间升序
  occupiedRunAtLocal: string[]; // 别人占用的站点本地运行分钟（D-14，不含任何身份），只用来提前提示「已被占用」
  mine: BookingTaskDto[]; // 自己的全部（管理员是所有人的），id 降序
  loading: boolean; // 列表还没拿到
  // 我的订场账号（普通用户）：undefined = 还没拿到；null = 没绑定。管理员不用它，永远是 undefined。
  // 只放服务端给的账号 DTO（没有任何秘密）；密码只活在 AccountCard 的组件 state 里，绝不进这里
  account: BookingAccountDto | null | undefined;
  accountFailed: boolean; // 账号状态没拿到（只用于提示，不当成「没绑定」）
  toast: string; // 空串 = 不显示
  form: BookingForm;
  editingId: number | null; // null = 新建态；不为 null = 正在编辑这条任务
}

// 单人价缺省值：没有可参考的行情数据，取一个中间值让人自己改，不是推荐价
export const PRICE_DEFAULT = 100;

/** 表单缺省值：新建态的起点，退出编辑态时也回到它。 */
export function defaultForm(now: Date): BookingForm {
  const run = defaultRunAt(now);
  return {
    runDate: run.date,
    runTime: run.time,
    playDate: defaultPlayDate(run.date),
    playDateTouched: false,
    timeStart: TIME_START_DEFAULT,
    timeEnd: TIME_END_DEFAULT,
    players: PLAYERS_DEFAULT,
    maxPrice: PRICE_DEFAULT,
    sort: "EARLIEST",
  };
}

export function createInitialState(now: Date): BookingState {
  return {
    offline: false,
    user: undefined,
    courses: [],
    scheduled: [],
    occupiedRunAtLocal: [],
    mine: [],
    loading: true,
    account: undefined,
    accountFailed: false,
    toast: "",
    form: defaultForm(now),
    editingId: null,
  };
}

// 整页唯一的状态机：一个交互 = 一个 action。副作用（请求、toast 计时、确认框）都在 App 层。
export type BookingAction =
  | { type: "coursesLoaded"; courses: CourseDto[] }
  | { type: "userLoaded"; user: UserDto }
  | { type: "signedOut" }
  | { type: "tasksLoaded"; scheduled: BookingTaskDto[]; mine: BookingTaskDto[]; occupiedRunAtLocal: string[] }
  | { type: "accountLoaded"; account: BookingAccountDto | null }
  | { type: "accountFailed" }
  | { type: "loadFailed" } // 列表没拿到：只结束「加载中」，已有的列表原样保留
  | { type: "taskCreated"; task: BookingTaskDto }
  | { type: "taskCancelled"; task: BookingTaskDto }
  | { type: "editStarted"; task: BookingTaskDto }
  | { type: "editCancelled"; now: Date } // now 由 App 传入，reducer 保持纯函数
  | { type: "taskUpdated"; task: BookingTaskDto; now: Date }
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
      return {
        ...state, user: null, scheduled: [], occupiedRunAtLocal: [], mine: [], loading: false, editingId: null,
        account: undefined, accountFailed: false,
      };
    case "tasksLoaded":
      return {
        ...state, scheduled: action.scheduled, mine: action.mine,
        occupiedRunAtLocal: action.occupiedRunAtLocal, loading: false,
      };
    case "accountLoaded":
      return { ...state, account: action.account, accountFailed: false };
    case "accountFailed":
      return { ...state, accountFailed: true };
    case "loadFailed":
      return { ...state, loading: false };
    case "taskCreated":
    case "taskCancelled":
      return { ...state, ...upsert(state, action.task) };
    case "editStarted": {
      const parts = runParts(action.task.runAtLocal);
      // 站点没有放号规则时没有本地时间，没法回填运行时间，不能编辑
      if (!parts) return state;
      const { task } = action;
      return {
        ...state,
        editingId: task.id,
        form: {
          runDate: parts.date,
          runTime: parts.time,
          playDate: task.playDate,
          playDateTouched: true, // 打球日是任务自己的值，改运行日时不能被覆盖
          timeStart: task.timeStart,
          timeEnd: task.timeEnd,
          players: task.players,
          maxPrice: task.maxPrice,
          sort: task.sort,
        },
      };
    }
    case "editCancelled":
      return { ...state, editingId: null, form: defaultForm(action.now) };
    case "taskUpdated":
      return { ...state, ...upsert(state, action.task), editingId: null, form: defaultForm(action.now) };
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
