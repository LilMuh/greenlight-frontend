// Auto Booking 页。要登录：没登录只提示去 config 页登录（登录面板在那边）。
// 这一版只有「建任务 → 刷新 Scheduled 列表」这一条路径；列表全貌与可见性规则见后续提交。
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError, createBookingTask, getCourses, getMe, listBookingTasks,
  type BookingSort, type BookingTaskDto, type CourseDto, type UserDto,
} from "../../api";
import { getToken } from "../../auth";
import { classifyError } from "../config/logic";
import { PLAYERS_DEFAULT, TIME_END_DEFAULT, TIME_START_DEFAULT } from "../config/strings";
import { Toast } from "../config/components/Toast";
import { STRINGS } from "./strings";
import {
  defaultPlayDate, defaultRunAt, northlandsCourseId, occupiedBy, siteToday, toRunAtLocal,
} from "./logic";

const PRICE_DEFAULT = 100;

function TimePicker(props: { value: string; onChange: (value: string) => void }) {
  const [hour, minute] = props.value.split(":");
  return (
    <div className="wa-timepick">
      <select className="wa-time-sel" value={hour} onChange={(event) => props.onChange(`${event.target.value}:${minute}`)}>
        {Array.from({ length: 24 }, (unused, index) => String(index).padStart(2, "0")).map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      <span className="wa-colon">:</span>
      <select className="wa-time-sel" value={minute} onChange={(event) => props.onChange(`${hour}:${event.target.value}`)}>
        {Array.from({ length: 60 }, (unused, index) => String(index).padStart(2, "0")).map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}

export function App() {
  const [courses, setCourses] = useState<CourseDto[]>([]);
  const [user, setUser] = useState<UserDto | null | undefined>(undefined);
  const [scheduled, setScheduled] = useState<BookingTaskDto[]>([]);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 缺省值在挂载时算一次：站点本地明天 07:00，打球日是运行日 + 5 天
  const [initial] = useState(() => defaultRunAt(new Date()));
  const [runDate, setRunDate] = useState(initial.date);
  const [runTime, setRunTime] = useState(initial.time);
  const [playDate, setPlayDate] = useState(() => defaultPlayDate(initial.date));
  const [playDateTouched, setPlayDateTouched] = useState(false);
  const [timeStart, setTimeStart] = useState(TIME_START_DEFAULT);
  const [timeEnd, setTimeEnd] = useState(TIME_END_DEFAULT);
  const [players, setPlayers] = useState(PLAYERS_DEFAULT);
  const [maxPrice, setMaxPrice] = useState(PRICE_DEFAULT);
  const [sort, setSort] = useState<BookingSort>("EARLIEST");

  const showToast = useCallback((message: string, durationMs = 2200) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), durationMs);
  }, []);

  const reportError = useCallback((error: unknown) => {
    showToast(classifyError(error).message, 2800);
  }, [showToast]);

  const refresh = useCallback(async () => {
    const tasks = await listBookingTasks();
    setScheduled(tasks.scheduled);
  }, []);

  useEffect(() => {
    getCourses().then(setCourses).catch(() => showToast(STRINGS.offline, 2600));
    if (!getToken()) {
      setUser(null);
      return;
    }
    getMe()
      .then(async (me) => {
        setUser(me);
        await refresh();
      })
      .catch((error) => {
        setUser(null);
        reportError(error);
      });
    // 只在挂载时跑一遍
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAtLocal = toRunAtLocal(runDate, runTime);
  const occupant = occupiedBy(scheduled, runAtLocal);
  const courseId = northlandsCourseId(courses);

  const handleRunDate = (value: string) => {
    setRunDate(value);
    // 打球日没被手动改过就跟着运行日走（运行日 + 5 天）
    if (!playDateTouched && value) setPlayDate(defaultPlayDate(value));
  };

  const submit = async () => {
    if (courseId == null) return showToast(STRINGS.needCourse);
    if (!runDate) return showToast(STRINGS.needRunDate);
    if (!playDate) return showToast(STRINGS.needPlayDate);
    if (timeEnd <= timeStart) return showToast(STRINGS.needTimeOrder);
    if (!Number.isInteger(maxPrice) || maxPrice < 1 || maxPrice > 1000) return showToast(STRINGS.needPrice);
    try {
      await createBookingTask({ courseId, playDate, runAtLocal, timeStart, timeEnd, players, maxPrice, sort });
      showToast(STRINGS.created);
      await refresh();
    } catch (error) {
      reportError(error);
      // 列表加载之后别人抢先建了同一运行时间：重新拉列表，占用提示就能显示出占用者（D-09）
      if (error instanceof ApiError && error.code === "BOOKING_RUN_AT_TAKEN") {
        try {
          await refresh();
        } catch {
          // 刷新失败不再打断，已经弹过原因了
        }
      }
    }
  };

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

      {user === null && (
        <div className="wa-body wa-body-center">
          <div className="wa-empty">
            <a href="config.html">Sign in</a> on the Watch Alerts page first, then come back.
          </div>
        </div>
      )}

      {user && (
        <div className="wa-body">
          <div className="wa-side">
            <div className="wa-form">
              <div className="wa-form-title">{STRINGS.newTitle}</div>

              <div className="wa-field">
                <div className="wa-label">{STRINGS.runDateLabel}</div>
                <input type="date" className="wa-email" value={runDate} min={siteToday(new Date())} onChange={(event) => handleRunDate(event.target.value)} />
              </div>
              <div className="wa-field">
                <div className="wa-label">{STRINGS.runTimeLabel}</div>
                <TimePicker value={runTime} onChange={setRunTime} />
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
                  value={playDate}
                  onChange={(event) => {
                    setPlayDateTouched(true);
                    setPlayDate(event.target.value);
                  }}
                />
              </div>

              <div className="wa-field">
                <div className="wa-label">{STRINGS.timeRangeLabel}</div>
                <div className="wa-timerow">
                  <TimePicker value={timeStart} onChange={setTimeStart} />
                  <span className="wa-to">{STRINGS.rangeTo}</span>
                  <TimePicker value={timeEnd} onChange={setTimeEnd} />
                </div>
              </div>

              <div className="wa-field">
                <div className="wa-label">{STRINGS.playersLabel}</div>
                <div className="wa-pills">
                  {[1, 2, 3, 4].map((count) => (
                    <button key={count} className={`wa-num${players === count ? " is-active" : ""}`} onClick={() => setPlayers(count)}>
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
                  value={maxPrice}
                  onChange={(event) => setMaxPrice(Number(event.target.value))}
                />
              </div>

              <div className="wa-field">
                <div className="wa-label">{STRINGS.sortLabel}</div>
                <div className="wa-pills">
                  <button className={`wa-pill${sort === "EARLIEST" ? " is-active" : ""}`} onClick={() => setSort("EARLIEST")}>
                    {STRINGS.sortEarliest}
                  </button>
                  <button className={`wa-pill${sort === "CHEAPEST" ? " is-active" : ""}`} onClick={() => setSort("CHEAPEST")}>
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

          <div className="wa-list">
            <div className="wa-count">{STRINGS.scheduledTitle}: {scheduled.length}</div>
            {scheduled.length ? (
              <div className="wa-cards">
                {scheduled.map((task) => (
                  <div key={task.id} className="wa-card">
                    <strong>{task.runAtLocal ?? task.runAt}</strong>
                    <div className="wa-bk-meta">{STRINGS.createdBy} {task.creatorLoginEmail}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="wa-empty">{STRINGS.scheduledEmpty}</div>
            )}
          </div>
        </div>
      )}

      <Toast message={toast} />
    </>
  );
}
