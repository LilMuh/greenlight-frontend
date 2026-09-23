import { PRICE_MAX, PRICE_MIN, STRINGS, WEEKDAYS } from "../strings";
import { formatClock, minuteOptions, parseClock, type CourseRef } from "../logic";
import type { State } from "../reducer";

// 时间选择器：24 小时制的时 + 分两个下拉（不用 <input type="time"> 的原因见 logic.ts）。
function TimePicker({ value24, onChange }: { value24: string; onChange: (value: string) => void }) {
  const { hour, minute } = parseClock(value24);
  return (
    <div className="wa-timepick">
      <select
        className="wa-time-sel"
        value={hour}
        onChange={(event) => onChange(formatClock(Number(event.target.value), minute))}
      >
        {Array.from({ length: 24 }, (unused, index) => index).map((option) => (
          <option key={option} value={option}>{String(option).padStart(2, "0")}</option>
        ))}
      </select>
      <span className="wa-colon">:</span>
      <select
        className="wa-time-sel"
        value={minute}
        onChange={(event) => onChange(formatClock(hour, Number(event.target.value)))}
      >
        {minuteOptions(minute).map((option) => (
          <option key={option} value={option}>{String(option).padStart(2, "0")}</option>
        ))}
      </select>
    </div>
  );
}

interface Props {
  formRef?: React.Ref<HTMLDivElement>; // App 的「Edit 时滚动到表单」需要拿到 .wa-form 节点
  state: State;
  onToggleCourse: (course: CourseRef) => void; // 编辑锁/维护拦截在 App 层统一弹 toast
  onWeekday: (code: string) => void;
  onPlayers: (count: number) => void;
  onPrice: (value: number) => void;
  onTime: (which: "start" | "end", value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

// 左栏整个表单：球场多选、星期、时间窗、人数、价格上限、邮箱，新建/编辑共用。
export function WatchForm(props: Props) {
  const { state } = props;
  // 编辑态球场是锁死的（换球场等于换成另一条 watch），整块置灰，选中的那个照常高亮
  const coursesLocked = state.editingId != null;

  return (
    <div className="wa-form" ref={props.formRef}>
      <div className="wa-form-title">{state.editingId ? STRINGS.editTitle : STRINGS.newTitle}</div>

      <div className="wa-field">
        <div className="wa-label">{STRINGS.coursesLabel}</div>
        <div>
          {state.courses.map((course) => {
            const isSelected = state.formCourses.includes(course.id);
            // 维护中的球场也置灰点不动；和编辑锁语义不同，class 分开
            const isMaintenance = course.maintenance === true;
            return (
              <div
                key={course.id}
                className={`wa-course${isSelected ? " is-on" : ""}${coursesLocked ? " is-locked" : ""}${isMaintenance ? " is-maintenance" : ""}`}
                onClick={() => props.onToggleCourse(course)}
              >
                <span className="wa-box" />
                <span className="wa-course-name">{course.name}</span>
                {isMaintenance && <span className="wa-course-badge">{STRINGS.maintenanceBadge}</span>}
              </div>
            );
          })}
        </div>
        {coursesLocked && <div className="wa-hint">{STRINGS.courseLocked}</div>}
      </div>

      <div className="wa-field">
        <div className="wa-label">{STRINGS.weekdaysLabel}</div>
        <div className="wa-days">
          {WEEKDAYS.map((weekday) => (
            <button
              key={weekday.code}
              className={`wa-day${state.formWeekdays.includes(weekday.code) ? " is-active" : ""}`}
              onClick={() => props.onWeekday(weekday.code)}
            >
              {weekday.label}
            </button>
          ))}
        </div>
      </div>

      <div className="wa-field">
        <div className="wa-label">{STRINGS.timeRangeLabel}</div>
        <div className="wa-timerow">
          <TimePicker value24={state.formTimeStart} onChange={(value) => props.onTime("start", value)} />
          <span className="wa-to">{STRINGS.rangeTo}</span>
          <TimePicker value24={state.formTimeEnd} onChange={(value) => props.onTime("end", value)} />
        </div>
      </div>

      <div className="wa-field">
        <div className="wa-label">{STRINGS.playersLabel}</div>
        <div className="wa-pills">
          {[1, 2, 3, 4].map((count) => (
            <button
              key={count}
              className={`wa-num${state.formPlayers === count ? " is-active" : ""}`}
              onClick={() => props.onPlayers(count)}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      <div className="wa-field">
        <div className="wa-price-head">
          <span>{STRINGS.maxPriceLabel}</span>
          {/* 数字跟着滑块实时变：它和滑块读的是同一个 state，天然一致 */}
          <span className="wa-price-val">${state.formMaxPrice}</span>
        </div>
        <input
          type="range"
          className="wa-range"
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={5}
          value={state.formMaxPrice}
          onChange={(event) => props.onPrice(parseInt(event.target.value, 10))}
        />
      </div>

      {/* 提醒发到账号的通知邮箱，在「Account」里改 */}
      {state.user && (
        <div className="wa-field">
          <div className="wa-label">{STRINGS.emailLabel}</div>
          <div className="wa-account-value">{state.user.notifyEmail}</div>
        </div>
      )}

      <div className="wa-actions">
        <button className="wa-submit" onClick={props.onSubmit}>
          {state.editingId ? STRINGS.saveBtn : STRINGS.createBtn}
        </button>
        {state.editingId != null && (
          <button className="wa-cancel" onClick={props.onCancel}>{STRINGS.cancel}</button>
        )}
      </div>
    </div>
  );
}
