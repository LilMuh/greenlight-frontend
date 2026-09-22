import { STRINGS } from "../strings";

// 顶部日期条：今天 + 后 7 天，点一格切换查询日。
interface Props {
  dates: { date: Date; iso: string }[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function DateStrip({ dates, selectedIndex, onSelect }: Props) {
  return (
    <div className="tt-dates">
      {dates.map((dateInfo, index) => {
        const isActive = index === selectedIndex;
        const label = index === 0 ? STRINGS.today : STRINGS.weekdays[dateInfo.date.getDay()];
        return (
          <div
            key={dateInfo.iso}
            className={`tt-date${isActive ? " is-active" : ""}`}
            onClick={() => onSelect(index)}
          >
            <span className="tt-date-top">{label}</span>
            <span className="tt-date-num">{dateInfo.date.getDate()}</span>
            <span className="tt-date-top">{STRINGS.monthLabel(dateInfo.date.getMonth())}</span>
          </div>
        );
      })}
    </div>
  );
}
