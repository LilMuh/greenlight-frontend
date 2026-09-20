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

export function WatchCard({ watch, isOpen, hitCount, inMaintenance, ...actions }: Props) {
  const chips = [
    weekdaysText(watch.weekdays),
    `${watch.timeStart}–${watch.timeEnd}`,
    `${watch.players}${STRINGS.playerUnit}`,
    `≤$${watch.maxPrice}`,
  ].filter(Boolean);

  return (
    <div className={`wa-card${isOpen ? " is-open" : ""}`}>
      {/* 整行都是展开热区。Active/Paused 开关嵌在里面，stopPropagation 保证点开关不会顺手把卡片展开
          （旧版靠事件委托取最内层 [data-act] 达到同样效果）。
          展开行是 <div role="button">，Enter / 空格的激活得自己补：折叠里藏着 Edit 和 Delete，
          打不开这一行的键盘用户就等于用不了这两个操作。 */}
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
          <span className="wa-card-email">{watch.email}</span>
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
      {/* 折叠时详情整块不渲染（而不是 display:none）：卡片高度就是真的只有一行，
          也不会留下点得到、读屏能读到的隐藏按钮。
          球场在维护：折叠时靠球场名旁边的徽章提示，展开时给整句话——
          否则用户只看到「Paused」，会以为是自己关的。 */}
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
