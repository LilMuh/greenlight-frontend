import { PRICE_MAX, PRICE_MIN, STRINGS, WEEKDAYS } from "../strings";
import { foreignOwnerEmail, formatClock, minuteOptions, parseClock, type CourseRef } from "../logic";
import type { State } from "../reducer";

// 时间选择器：24 小时制，时和分各一个下拉框。不用 <input type="time"> 的原因见 logic.ts。
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
  formRef?: React.Ref<HTMLDivElement>; // App 在 Edit 时滚动到表单，需要 .wa-form 节点
  state: State;
  onToggleCourse: (course: CourseRef) => void; // 编辑锁和维护拦截的 toast 统一在 App 层弹出
  onWeekday: (code: string) => void;
  onPlayers: (count: number) => void;
  onPrice: (value: number) => void;
  onTime: (which: "start" | "end", value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

// 左栏的整个表单，新建和编辑共用。字段：球场多选、星期、时间窗、人数、价格上限、邮箱。
export function WatchForm(props: Props) {
  const { state } = props;
  // 编辑时球场被锁定（换球场等于换成另一条 watch）。整块置灰，选中的球场照常高亮
  const coursesLocked = state.editingId != null;
  // 管理员改的是别人的 watch 时，标题写明主人
  const otherOwner = state.user
    ? foreignOwnerEmail(state.watches.find((watch) => watch.id === state.editingId), state.user.id)
    : null;
  const title = state.editingId
    ? otherOwner ? STRINGS.editOthersTitle(otherOwner) : STRINGS.editTitle
    : STRINGS.newTitle;

  return (
    <div className="wa-form" ref={props.formRef}>
      <div className="wa-form-title">{title}</div>

      <div className="wa-field">
        <div className="wa-label">{STRINGS.coursesLabel}</div>
        <div>
          {state.courses.map((course) => {
            const isSelected = state.formCourses.includes(course.id);
            // 维护中的球场也置灰，不能点击。它和编辑锁的语义不同，因此用不同的 class
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
          {/* 数字随滑块实时变化。原因：数字和滑块读同一个 state，因此始终一致 */}
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

      {/* 提醒发到账号的通知邮箱，在「Account」里修改。
          管理员改别人的 watch 时，不显示这一项。原因：那条 watch 的提醒发到主人自己的通知邮箱，
          但这里只知道主人的登录邮箱。不写比写错好 */}
      {state.user && !otherOwner && (
        <div className="wa-field">
          <div className="wa-label">{STRINGS.emailLabel}</div>
          <div className="wa-account-value">{state.user.notifyEmail ?? STRINGS.notSet}</div>
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
