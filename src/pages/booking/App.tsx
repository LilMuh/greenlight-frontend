// Auto Booking 页。要登录：没登录只提示去 config 页登录（登录面板在那边）。
// 可见性（D-15 / D-16）：管理员和开启了订场的用户看得到列表；只有开启了订场的普通用户看得到建任务表单。
// 前端只决定显示，建 / 查 / 取消的权限全在后端判定。
import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  ApiError, cancelBookingTask, createBookingTask, getCourses, getMe, listBookingTasks,
  type BookingTaskDto,
} from "../../api";
import { getToken } from "../../auth";
import { classifyError } from "../config/logic";
import { Toast } from "../config/components/Toast";
import { STRINGS } from "./strings";
import {
  accountLabel, canCreate, canSeeBooking, describeResult, northlandsCourseId, occupiedBy,
  playLineText, runLineText, siteToday, toRunAtLocal,
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
// 标题是「球场 #任务号」；运行时间（蓝）与打球日（绿，带星期与时段）各占一行，一眼分清「什么时候跑」和「订哪天」
function TaskCard(props: { task: BookingTaskDto; withResult: boolean; onCancel?: (task: BookingTaskDto) => void }) {
  const { task } = props;
  return (
    <div className="wa-card">
      <div className="wa-bk-head">
        <strong>{STRINGS.taskTitle(task.courseName, task.id)}</strong>
        <span className={`wa-bk-status is-${task.status.toLowerCase()}`}>{STRINGS.statusText[task.status]}</span>
      </div>
      <div className="wa-bk-when is-run">
        <span className="wa-bk-when-label">{STRINGS.runsAt}</span>
        <span className="wa-bk-when-value">{runLineText(task)}</span>
      </div>
      <div className="wa-bk-when is-play">
        <span className="wa-bk-when-label">{STRINGS.plays}</span>
        <span className="wa-bk-when-value">{playLineText(task)}</span>
      </div>
      <div className="wa-chips">
        <span className="wa-chip">{task.players}{STRINGS.playerUnit}</span>
        <span className="wa-chip">{STRINGS.maxPriceText(task.maxPrice)}</span>
        <span className="wa-chip">{STRINGS.sortText(task.sort)}</span>
      </div>
      <div className="wa-bk-meta">{STRINGS.createdBy} {task.creatorLoginEmail}</div>
      <div className="wa-bk-meta">{STRINGS.bookingAccount}: {accountLabel(task)}</div>
      {props.withResult && <div className="wa-bk-result">{describeResult(task)}</div>}
      {props.withResult && task.cancellable && props.onCancel && (
        <div className="wa-card-actions">
          <button className="wa-delete" onClick={() => props.onCancel?.(task)}>{STRINGS.cancelBtn}</button>
        </div>
      )}
    </div>
  );
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(new Date()));
  const { user, form, scheduled, mine } = state;
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
      dispatch({ type: "tasksLoaded", scheduled: tasks.scheduled, mine: tasks.mine });
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
        if (canSeeBooking(me)) await refresh();
      })
      .catch((error) => {
        dispatch({ type: "signedOut" });
        reportError(error);
      });
    // 只在挂载时跑一遍
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAtLocal = toRunAtLocal(form.runDate, form.runTime);
  // D-09：这个运行时间已有活动任务就提示是谁占的，并拦住提交（数据来自 scheduled 列表）
  const occupant = occupiedBy(scheduled, runAtLocal);
  const courseId = northlandsCourseId(state.courses);

  const toast = (message: string) => dispatch({ type: "toast", message });

  const submit = async () => {
    if (courseId == null) return toast(STRINGS.needCourse);
    if (!form.runDate) return toast(STRINGS.needRunDate);
    if (!form.playDate) return toast(STRINGS.needPlayDate);
    if (form.timeEnd <= form.timeStart) return toast(STRINGS.needTimeOrder);
    if (!Number.isInteger(form.maxPrice) || form.maxPrice < 1 || form.maxPrice > 1000) return toast(STRINGS.needPrice);
    try {
      const created = await createBookingTask({
        courseId,
        playDate: form.playDate,
        runAtLocal,
        timeStart: form.timeStart,
        timeEnd: form.timeEnd,
        players: form.players,
        maxPrice: form.maxPrice,
        sort: form.sort,
      });
      dispatch({ type: "taskCreated", task: created });
      toast(STRINGS.created);
      await refresh();
    } catch (error) {
      reportError(error);
      // 列表加载之后别人抢先建了同一运行时间：重新拉列表，占用提示就能显示出占用者（D-09）。
      // 后端 409 的 message 只带任务号、不带邮箱，占用者一律从 scheduled 列表取（05-06）。
      if (error instanceof ApiError && error.code === "BOOKING_RUN_AT_TAKEN") await refresh();
    }
  };

  const cancel = async (task: BookingTaskDto) => {
    if (!window.confirm(STRINGS.cancelConfirm)) return;
    try {
      const cancelled = await cancelBookingTask(task.id);
      dispatch({ type: "taskCancelled", task: cancelled });
      toast(STRINGS.cancelled);
      await refresh();
    } catch (error) {
      reportError(error);
      // 已被领取 / 已结束（BOOKING_TASK_NOT_PENDING）或已不存在：列表是旧的，重新拉
      if (error instanceof ApiError && error.code?.startsWith("BOOKING_TASK_")) await refresh();
    }
  };

  const change = (patch: BookingFormPatch) => dispatch({ type: "formChanged", patch });

  return (
    <>
      <div className="wa-header">
        <div className="wa-brand">
          <span className="wa-dot" />
          <div className="wa-brand-text">
            <strong>{STRINGS.appName}</strong>
            <small>{STRINGS.tagline}</small>
          </div>
        </div>
        <div className="wa-head-right">
          <div className="wa-nav">
            <a href="index.html">{STRINGS.navQuery}</a>
            <a href="config.html">{STRINGS.navWatch}</a>
            <a href="booking.html" className="is-active">{STRINGS.navBooking}</a>
          </div>
        </div>
      </div>

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

      {user && canSeeBooking(user) && (
        <div className="wa-body">
          {/* D-15：管理员看不到建任务表单 */}
          {canCreate(user) && (
            <div className="wa-side">
              <div className="wa-form">
                <div className="wa-form-title">{STRINGS.newTitle}</div>

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
                {occupant && (
                  <div className="wa-bk-occupied" role="alert">
                    {STRINGS.occupied(occupant.creatorLoginEmail, occupant.id)}
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
                  <button className="wa-submit" disabled={occupant != null} onClick={() => void submit()}>
                    {STRINGS.createBtn}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="wa-list">
            {user.admin && <div className="wa-hint">{STRINGS.adminNote}</div>}

            <section className="wa-bk-section">
              <div className="wa-group-head">{STRINGS.scheduledTitle}</div>
              <div className="wa-count">{STRINGS.scheduledHint}</div>
              {state.loading ? (
                <div className="wa-empty">{STRINGS.loadingTasks}</div>
              ) : scheduled.length ? (
                <div className="wa-cards">
                  {scheduled.map((task) => <TaskCard key={task.id} task={task} withResult={false} />)}
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
                    <TaskCard key={task.id} task={task} withResult onCancel={(target) => void cancel(target)} />
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
