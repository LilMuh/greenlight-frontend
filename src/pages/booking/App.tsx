// Auto Booking 页。要登录：没登录只提示去 config 页登录（登录面板在那边）。
// 可见性（D-15 / D-16）：管理员和开启了订场的用户看得到列表；只有开启了订场的普通用户看得到建任务表单。
// 前端只决定显示，建 / 查 / 改 / 取消的权限全在后端判定。
import { useCallback, useEffect, useReducer, useRef, useSyncExternalStore } from "react";
import {
  ApiError, cancelBookingTask, createBookingTask, getCourses, getMe, getMyBookingAccount, listBookingTasks, logout,
  updateBookingTask, type BookingTaskDto,
} from "../../api";
import { clearToken, getToken } from "../../auth";
import { SiteHeader } from "../../components/SiteHeader";
import { classifyError } from "../config/logic";
import { Toast } from "../config/components/Toast";
import { AccountCard, AccountChip, AdminOverview } from "./AccountCard";
import { accountPlacement } from "./accountCardLogic";
import { STRINGS } from "./strings";
import {
  accountLabel, bookedSlotView, canCreate, canSeeBooking, cardResultText, isRunAtTaken,
  northlandsCourseId, playLineText, runLineText, siteToday, toRunAtLocal, whenLabels,
} from "./logic";
import { createInitialState, reducer, type BookingFormPatch } from "./reducer";

function TimePicker(props: { value: string; onChange: (value: string) => void }) {
  const [hour, minute] = props.value.split(":");
  const two = (count: number) => Array.from({ length: count }, (unused, index) => String(index).padStart(2, "0"));
  return (
    <div className="wa-timepick">
      <select className="wa-time-sel" value={hour} onChange={(event) => props.onChange(`${event.target.value}:${minute}`)}>
        {two(24).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <span className="wa-colon">:</span>
      <select className="wa-time-sel" value={minute} onChange={(event) => props.onChange(`${hour}:${event.target.value}`)}>
        {two(60).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}

// 一条任务的卡片：Scheduled 与 My tasks 共用；My tasks 才带结果说明与取消按钮。
// 卡片不显示创建者；BOOKED 且有深绿时段块时不再显示结果句（块建不出来才回退显示）。
// 标题是「球场 #任务号」；运行时间（蓝）与打球日（绿，带星期与时段）各占一行，一眼分清「什么时候跑」和「订哪天」
function TaskCard(props: {
  task: BookingTaskDto;
  withResult: boolean;
  onCancel?: (task: BookingTaskDto) => void;
  onEdit?: (task: BookingTaskDto) => void;
}) {
  const { task } = props;
  const canEdit = task.editable && !!props.onEdit;
  const canCancel = props.withResult && task.cancellable && !!props.onCancel;
  const booked = bookedSlotView(task);
  // BOOKED 且有深绿时段块时 cardResultText 为 null，不重复显示结果句
  const resultText = props.withResult ? cardResultText(task) : null;
  const labels = whenLabels(task.status);
  return (
    <div className={`wa-card${task.status === "BOOKED" ? " is-booked" : ""}`}>
      <div className="wa-bk-head">
        <strong>{STRINGS.taskTitle(task.courseName, task.id)}</strong>
        <span className={`wa-bk-status is-${task.status.toLowerCase()}`}>{STRINGS.statusText[task.status]}</span>
      </div>
      {booked && (
        <div className="wa-bk-booked">
          <span className="wa-bk-booked-label">{booked.label}</span>
          <span className="wa-bk-booked-time">{booked.headline}</span>
          {booked.players && <span className="wa-bk-booked-players">{booked.players}</span>}
        </div>
      )}
      <div className="wa-bk-when is-run">
        <span className="wa-bk-when-label">{labels.run}</span>
        <span className="wa-bk-when-value">{runLineText(task)}</span>
      </div>
      <div className="wa-bk-when is-play">
        <span className="wa-bk-when-label">{labels.play}</span>
        <span className="wa-bk-when-value">{playLineText(task)}</span>
      </div>
      <div className="wa-chips">
        <span className="wa-chip">{task.players}{STRINGS.playerUnit}</span>
        <span className="wa-chip">{STRINGS.maxPriceText(task.maxPrice)}</span>
        <span className="wa-chip">{STRINGS.sortText(task.sort)}</span>
      </div>
      <div className="wa-bk-meta">{STRINGS.bookingAccount}: {accountLabel(task)}</div>
      {resultText !== null && <div className="wa-bk-result">{resultText}</div>}
      {(canEdit || canCancel) && (
        <div className="wa-card-actions">
          {canEdit && <button className="wa-edit" onClick={() => props.onEdit?.(task)}>{STRINGS.editBtn}</button>}
          {canCancel && <button className="wa-delete" onClick={() => props.onCancel?.(task)}>{STRINGS.cancelBtn}</button>}
        </div>
      )}
    </div>
  );
}

// 与 config/styles.css 里 .wa-body 换成一列的断点一致：窄于它时表单在上、任务列表在下
const PHONE_QUERY = "(max-width: 860px)";

/** 是否是一列布局（手机）。没有 matchMedia（SSR、测试）时按桌面算。 */
function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const query = window.matchMedia(PHONE_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(new Date()));
  const { user, form, scheduled, mine } = state;
  const formRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // toast 在 reducer 里，这里只管计时清掉；连续弹时新消息顶掉旧的、重新计时
  useEffect(() => {
    clearTimeout(toastTimer.current);
    if (state.toast) toastTimer.current = setTimeout(() => dispatch({ type: "toast", message: "" }), 2600);
    return () => clearTimeout(toastTimer.current);
  }, [state.toast]);

  // 把失败翻成 toast；连不上后端标成离线，会话过期回到登录态
  const reportError = useCallback((error: unknown) => {
    const { offline, signedOut, message } = classifyError(error);
    if (offline) {
      dispatch({ type: "offline" });
      return;
    }
    if (signedOut) dispatch({ type: "signedOut" });
    dispatch({ type: "toast", message });
  }, []);

  // 拉一遍列表（scheduled + mine）。失败只弹 toast，已有的列表原样保留
  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const tasks = await listBookingTasks();
      dispatch({
        type: "tasksLoaded", scheduled: tasks.scheduled, mine: tasks.mine,
        // 后端旧版本没有这个字段时当空，不让页面崩
        occupiedRunAtLocal: tasks.occupiedRunAtLocal ?? [],
      });
      return true;
    } catch (error) {
      reportError(error);
      dispatch({ type: "loadFailed" });
      return false;
    }
  }, [reportError]);

  useEffect(() => {
    getCourses()
      .then((courses) => dispatch({ type: "coursesLoaded", courses }))
      .catch(() => dispatch({ type: "offline" }));
    if (!getToken()) {
      dispatch({ type: "signedOut" });
      return;
    }
    getMe()
      .then(async (me) => {
        dispatch({ type: "userLoaded", user: me });
        if (canSeeBooking(me)) {
          // 管理员没有自己的订场账号（GET 会是 204），不去拉
          if (!me.admin) {
            getMyBookingAccount()
              .then((account) => dispatch({ type: "accountLoaded", account }))
              .catch((error) => {
                dispatch({ type: "accountFailed" });
                reportError(error);
              });
          }
          await refresh();
        }
      })
      .catch((error) => {
        dispatch({ type: "signedOut" });
        reportError(error);
      });
    // 只在挂载时跑一遍
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAtLocal = toRunAtLocal(form.runDate, form.runTime);
  // D-09 / D-14：这个运行时间已被占用就提前提示并拦住提交；只说「已被占用」，不说是谁（数据来自后端给的
  // 不含身份的 occupiedRunAtLocal，以及自己的 scheduled）
  const taken = isRunAtTaken(state.occupiedRunAtLocal, scheduled, runAtLocal, state.editingId);
  const courseId = northlandsCourseId(state.courses);

  const toast = (message: string) => dispatch({ type: "toast", message });

  // 登出：后端撤销失败时，也照样清除本地令牌（与 Watch Alerts 同一机制）。
  // signedOut 会清掉上一个人的任务列表和 editingId，页面回到登录提示
  const handleSignOut = async () => {
    try {
      await logout();
    } catch {
      // 忽略
    }
    clearToken();
    dispatch({ type: "signedOut" });
    toast(STRINGS.signedOut);
  };

  const submit = async () => {
    if (courseId == null) return toast(STRINGS.needCourse);
    if (!form.runDate) return toast(STRINGS.needRunDate);
    if (!form.playDate) return toast(STRINGS.needPlayDate);
    if (form.timeEnd <= form.timeStart) return toast(STRINGS.needTimeOrder);
    if (!Number.isInteger(form.maxPrice) || form.maxPrice < 1 || form.maxPrice > 1000) return toast(STRINGS.needPrice);
    const dto = {
      courseId,
      playDate: form.playDate,
      runAtLocal,
      timeStart: form.timeStart,
      timeEnd: form.timeEnd,
      players: form.players,
      maxPrice: form.maxPrice,
      sort: form.sort,
    };
    try {
      if (state.editingId != null) {
        const updated = await updateBookingTask(state.editingId, dto);
        dispatch({ type: "taskUpdated", task: updated, now: new Date() });
        toast(STRINGS.updated);
      } else {
        const created = await createBookingTask(dto);
        dispatch({ type: "taskCreated", task: created });
        toast(STRINGS.created);
      }
      await refresh();
    } catch (error) {
      reportError(error);
      // 任务已不能改（被领取 / 已结束 / 不存在 / 即将运行）：表单不能停在一条改不了的记录上，退出编辑态并刷新
      if (
        state.editingId != null && error instanceof ApiError &&
        (error.code === "BOOKING_TASK_NOT_PENDING" || error.code === "BOOKING_TASK_NOT_FOUND" ||
          error.code === "BOOKING_TASK_ABOUT_TO_RUN")
      ) {
        dispatch({ type: "editCancelled", now: new Date() });
        await refresh();
        return;
      }
      // 列表加载之后别人抢先建了同一运行时间：重新拉一次列表（刷新 occupiedRunAtLocal），提示还是同一句，
      // 不显示占用者（D-14）。
      if (error instanceof ApiError && error.code === "BOOKING_RUN_AT_TAKEN") await refresh();
    }
  };

  const cancel = async (task: BookingTaskDto) => {
    if (!window.confirm(STRINGS.cancelConfirm)) return;
    try {
      const cancelled = await cancelBookingTask(task.id);
      dispatch({ type: "taskCancelled", task: cancelled });
      if (state.editingId === task.id) dispatch({ type: "editCancelled", now: new Date() });
      toast(STRINGS.cancelled);
      await refresh();
    } catch (error) {
      reportError(error);
      // 已被领取 / 已结束（BOOKING_TASK_NOT_PENDING）或已不存在：列表是旧的，重新拉
      if (error instanceof ApiError && error.code?.startsWith("BOOKING_TASK_")) {
        if (state.editingId === task.id) dispatch({ type: "editCancelled", now: new Date() });
        await refresh();
      }
    }
  };

  // 手机上表单在列表上方或屏幕外：载入后滚到表单（与 config 页的 startEdit 同写法）
  const startEdit = (task: BookingTaskDto) => {
    dispatch({ type: "editStarted", task });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const cancelEdit = () => dispatch({ type: "editCancelled", now: new Date() });

  // 管理员没有表单，不给 Edit（后端同样拒绝）
  // D-07：账号不是 VALID 时也不给 Edit（后端同样拒绝，BOOKING_ACCOUNT_REQUIRED）
  const creatable = canCreate(user, state.account);
  // D-18（修订 D-13）：管理员 → 顶部只读总览；VALID → 顶部一行小字；其余 → 紧凑卡片占建任务表单的位置（表单不渲染）
  const placement = user && canSeeBooking(user) ? accountPlacement(user.admin, state.account) : null;
  const phone = usePhoneLayout();
  // VALID 账号的小卡片：桌面在任务列表上方、手机在建任务表单上方，同一时刻只挂一个
  const chip = user && placement === "line" ? (
    <AccountChip
      user={user}
      account={state.account}
      loadFailed={state.accountFailed}
      onAccountChange={(account) => dispatch({ type: "accountLoaded", account })}
      onSignedOut={() => dispatch({ type: "signedOut" })}
      onUnlinked={() => void refresh()}
    />
  ) : null;
  const onEdit = creatable ? startEdit : undefined;

  const change = (patch: BookingFormPatch) => dispatch({ type: "formChanged", patch });

  return (
    <>
      <SiteHeader active="booking" user={user} tagline={STRINGS.tagline} onSignOut={() => void handleSignOut()} />

      {/* user === undefined：还在确认登录态，先不渲染，免得提示一闪而过 */}
      {user === null && (
        <div className="wa-body wa-body-center">
          <div className="wa-empty">
            <p>{STRINGS.signInPrompt}</p>
            <a href="config.html">{STRINGS.signInLink}</a>
          </div>
        </div>
      )}

      {user && !canSeeBooking(user) && (
        <div className="wa-body wa-body-center">
          <div className="wa-empty">{STRINGS.notEnabled}</div>
        </div>
      )}

      {/* D-12：管理员看到所有人的绑定状态总览（只读），在任务表单与列表之上 */}
      {user && placement === "admin" && (
        <div className="wa-bk-top">
          <AdminOverview onSignedOut={() => dispatch({ type: "signedOut" })} />
        </div>
      )}

      {user && canSeeBooking(user) && (
        <div className="wa-body">
          {/* D-18：没有 VALID 账号时，紧凑的账号卡片占建任务表单的位置（与下面的表单互斥） */}
          {user && placement === "card" && (
            <div className="wa-side">
              <AccountCard
                user={user}
                account={state.account}
                loadFailed={state.accountFailed}
                onAccountChange={(account) => dispatch({ type: "accountLoaded", account })}
                onSignedOut={() => dispatch({ type: "signedOut" })}
                onUnlinked={() => void refresh()}
              />
            </div>
          )}
          {/* D-15：管理员看不到建任务表单 */}
          {creatable && (
            <div className="wa-side" ref={formRef}>
              {/* 手机是一列，小卡片放在 New Booking Task 上方（用户 2026-11-10 指定） */}
              {placement === "line" && phone && chip}
              <div className="wa-form">
                <div className="wa-form-title">
                  {state.editingId != null ? STRINGS.editTitle(state.editingId) : STRINGS.newTitle}
                </div>

                <div className="wa-field">
                  <div className="wa-label">{STRINGS.runDateLabel}</div>
                  <input
                    type="date"
                    className="wa-email"
                    value={form.runDate}
                    min={siteToday(new Date())}
                    onChange={(event) => change({ runDate: event.target.value })}
                  />
                </div>
                <div className="wa-field">
                  <div className="wa-label">{STRINGS.runTimeLabel}</div>
                  <TimePicker value={form.runTime} onChange={(value) => change({ runTime: value })} />
                  <div className="wa-hint">{STRINGS.siteZoneNote}</div>
                </div>
                {taken && (
                  <div className="wa-bk-occupied" role="alert">
                    {STRINGS.occupied}
                  </div>
                )}

                <div className="wa-field">
                  <div className="wa-label">{STRINGS.playDateLabel}</div>
                  <input
                    type="date"
                    className="wa-email"
                    value={form.playDate}
                    onChange={(event) => change({ playDate: event.target.value })}
                  />
                </div>

                <div className="wa-field">
                  <div className="wa-label">{STRINGS.timeRangeLabel}</div>
                  <div className="wa-timerow">
                    <TimePicker value={form.timeStart} onChange={(value) => change({ timeStart: value })} />
                    <span className="wa-to">{STRINGS.rangeTo}</span>
                    <TimePicker value={form.timeEnd} onChange={(value) => change({ timeEnd: value })} />
                  </div>
                </div>

                <div className="wa-field">
                  <div className="wa-label">{STRINGS.playersLabel}</div>
                  <div className="wa-pills">
                    {[1, 2, 3, 4].map((count) => (
                      <button
                        key={count}
                        className={`wa-num${form.players === count ? " is-active" : ""}`}
                        onClick={() => change({ players: count })}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="wa-field">
                  <div className="wa-label">{STRINGS.maxPriceLabel}</div>
                  <input
                    type="number"
                    className="wa-email"
                    min={1}
                    max={1000}
                    step={1}
                    value={form.maxPrice}
                    onChange={(event) => change({ maxPrice: Number(event.target.value) })}
                  />
                </div>

                <div className="wa-field">
                  <div className="wa-label">{STRINGS.sortLabel}</div>
                  <div className="wa-pills">
                    <button
                      className={`wa-pill${form.sort === "EARLIEST" ? " is-active" : ""}`}
                      onClick={() => change({ sort: "EARLIEST" })}
                    >
                      {STRINGS.sortEarliest}
                    </button>
                    <button
                      className={`wa-pill${form.sort === "CHEAPEST" ? " is-active" : ""}`}
                      onClick={() => change({ sort: "CHEAPEST" })}
                    >
                      {STRINGS.sortCheapest}
                    </button>
                  </div>
                </div>

                <div className="wa-actions">
                  <button className="wa-submit" disabled={taken} onClick={() => void submit()}>
                    {state.editingId != null ? STRINGS.saveBtn : STRINGS.createBtn}
                  </button>
                  {state.editingId != null && (
                    <button className="wa-cancel" onClick={cancelEdit}>{STRINGS.cancelEditBtn}</button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="wa-list">
            {user.admin && <div className="wa-hint">{STRINGS.adminNote}</div>}
            {/* 账号 VALID 后：桌面是任务列表上方的小卡片（用户 2026-11-10 设计稿：在 Scheduled 之上） */}
            {placement === "line" && !phone && chip}

            <section className="wa-bk-section">
              <div className="wa-group-head">{STRINGS.scheduledTitle}</div>
              <div className="wa-count">{user.admin ? STRINGS.scheduledHintAdmin : STRINGS.scheduledHint}</div>
              {state.loading ? (
                <div className="wa-empty">{STRINGS.loadingTasks}</div>
              ) : scheduled.length ? (
                <div className="wa-cards">
                  {scheduled.map((task) => (
                    <TaskCard key={task.id} task={task} withResult={false} onEdit={onEdit} />
                  ))}
                </div>
              ) : (
                <div className="wa-empty">{STRINGS.scheduledEmpty}</div>
              )}
            </section>

            <section className="wa-bk-section">
              <div className="wa-group-head">{user.admin ? STRINGS.myTitleAdmin : STRINGS.myTitle}</div>
              <div className="wa-count">{STRINGS.countText(mine.length)}</div>
              {state.loading ? (
                <div className="wa-empty">{STRINGS.loadingTasks}</div>
              ) : mine.length ? (
                <div className="wa-cards">
                  {mine.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      withResult
                      onCancel={(target) => void cancel(target)}
                      onEdit={onEdit}
                    />
                  ))}
                </div>
              ) : (
                <div className="wa-empty">{STRINGS.myEmpty}</div>
              )}
            </section>
          </div>
        </div>
      )}

      <Toast message={state.toast} />
    </>
  );
}
