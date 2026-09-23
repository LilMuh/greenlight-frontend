import { STRINGS } from "../strings";
import { weekdaysText, type WatchView } from "../logic";

interface Props {
  watch: WatchView;
  isOpen: boolean;
  hitCount: number;
  inMaintenance: boolean;
  onExpand: (id: number) => void;
  onToggleActive: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}

// 一条 watch 的卡片：折叠时只有「球场 + 邮箱 + 启停开关」一行，
// 展开后是命中数、条件 chips 和 Edit / Delete。
export function WatchCard({ watch, isOpen, hitCount, inMaintenance, ...actions }: Props) {
  const chips = [
    weekdaysText(watch.weekdays),
    `${watch.timeStart}–${watch.timeEnd}`,
    `${watch.players}${STRINGS.playerUnit}`,
    `≤$${watch.maxPrice}`,
  ].filter(Boolean);

  return (
    <div className={`wa-card${isOpen ? " is-open" : ""}`}>
      {/* 整行都是展开热区；开关在行内，stopPropagation 防止点开关顺带展开卡片。
          <div role="button"> 的 Enter/空格激活要自己补，不然键盘用户打不开折叠里的 Edit/Delete。 */}
      <div
        className="wa-card-top"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={() => actions.onExpand(watch.id)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault(); // 空格在 <div> 上的默认行为是往下滚一屏
          actions.onExpand(watch.id);
        }}
      >
        <svg className="wa-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 6 15 12 9 18" />
        </svg>
        <div className="wa-card-head">
          <strong>{watch.courseName}</strong>
          {inMaintenance && <span className="wa-course-badge">{STRINGS.maintenanceBadge}</span>}
        </div>
        <div
          className={`wa-status${watch.active ? " is-on" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            actions.onToggleActive(watch.id);
          }}
        >
          <span className="wa-status-dot" />
          <span className="wa-status-text">{watch.active ? STRINGS.active : STRINGS.paused}</span>
        </div>
      </div>
      {/* 折叠时详情整块不渲染（不是 display:none）。维护中的球场展开后给整句说明，
          不然用户只看到 Paused 会以为是自己关的。 */}
      {isOpen && (
        <>
          {inMaintenance && <div className="wa-card-maintenance">{STRINGS.maintenanceCardNote}</div>}
          <div className="wa-card-hits">
            <span className={`wa-hits${hitCount > 0 ? " is-hot" : ""}`}>{STRINGS.hitsText(hitCount)}</span>
          </div>
          <div className="wa-chips">
            {chips.map((chipText) => (
              <span key={chipText} className="wa-chip">{chipText}</span>
            ))}
          </div>
          <div className="wa-card-actions">
            <button className="wa-edit" onClick={() => actions.onEdit(watch.id)}>{STRINGS.edit}</button>
            <button className="wa-delete" onClick={() => actions.onDelete(watch.id)}>{STRINGS.delete}</button>
          </div>
        </>
      )}
    </div>
  );
}
