import { STRINGS } from "../strings";
import { bookingUrl, type Card } from "../logic";

interface Props {
  card: Card;
  selectedIso: string;
  selectedChip: string | null;
  onChip: (key: string) => void;
  onBookFallback: (courseName: string) => void;
}

export function CourseCard({ card, selectedIso, selectedChip, onChip, onBookFallback }: Props) {
  const { course, teeTimes } = card;
  // 拼得出链接就用真 <a>（能新标签打开、能右键复制）；拼不出（比如 /api/courses
  // 没取到、source 是我们还不认识的来源）退回按钮 + toast，不给一个点了没反应的链接。
  const url = bookingUrl(course, selectedIso);
  // 库里存的是完整地址（"7800 Vivian Dr, Vancouver, BC V5S 2V9, Canada"），
  // 卡片放不下也不需要省市邮编，只取前两段："7800 Vivian Dr, Vancouver"。
  // 城市那段单独包一层 .tt-addr-city：手机宽度下 CSS 会把它藏掉，只剩街道，
  // 省得和球场名抢那一行。放 CSS 里做是为了不必监听 resize 重渲染。
  const [street = "", city = ""] = String(course.address ?? "").split(",");

  return (
    <div className="tt-card">
      <div className="tt-card-row">
        <div className="tt-photo">
          {course.imageUrl && (
            // 图片加载失败就把 <img> 摘掉，露出条纹底，不显示裂图
            <img src={course.imageUrl} alt="" loading="lazy" onError={(event) => event.currentTarget.remove()} />
          )}
        </div>
        <div className="tt-card-info">
          <strong className="tt-card-name">{course.name}</strong>
          {/* 评分/地址来自 Google Maps，可能为 null——有就显示，没有整块不渲染，
              绝不显示 "⭐ 0" 或空括号，那看起来像「评分是 0」而不是「没拿到数据」 */}
          {course.rating != null && (
            <span className="tt-card-rating">
              ⭐ {course.rating}
              {course.ratingCount != null && ` (${Number(course.ratingCount).toLocaleString()})`}
            </span>
          )}
          {course.address != null && street.trim() !== "" && (
            <span className="tt-card-address" title={course.address}>
              {street.trim()}
              {city.trim() !== "" && <span className="tt-addr-city">, {city.trim()}</span>}
            </span>
          )}
        </div>
        {url ? (
          <a className="tt-book" href={url} target="_blank" rel="noopener noreferrer">{STRINGS.book}</a>
        ) : (
          <button className="tt-book" onClick={() => onBookFallback(course.name)}>{STRINGS.book}</button>
        )}
      </div>
      <div className="tt-tees">
        {teeTimes.map((teeTime) => {
          const chipKey = course.id + "|" + teeTime.time;
          const isSelected = selectedChip === chipKey;
          const isLow = teeTime.availableSeats != null && teeTime.availableSeats <= 2;
          return (
            <div key={chipKey} className={`tt-tee${isSelected ? " is-on" : ""}`} onClick={() => onChip(chipKey)}>
              <span className="tt-tee-time">{teeTime.time}</span>
              <span className="tt-tee-price">${teeTime.price}</span>
              {teeTime.availableSeats != null && (
                <span className={`tt-tee-slots${isLow ? " is-low" : ""}`}>
                  {teeTime.availableSeats}
                  {STRINGS.seatsUnit}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
