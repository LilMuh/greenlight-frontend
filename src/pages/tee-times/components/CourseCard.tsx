import { useEffect, useRef, useState } from "react";
import { STRINGS } from "../strings";
import { bookingUrl, shortCourseName, type Card } from "../logic";

interface Props {
  card: Card;
  selectedIso: string;
  selectedChip: string | null;
  onChip: (key: string) => void;
  onBookFallback: (courseName: string) => void;
}

// 一张球场卡：照片、评分、地址、Book 按钮，下面一排可横向翻页的时段 chip。
export function CourseCard({ card, selectedIso, selectedChip, onChip, onBookFallback }: Props) {
  const { course, teeTimes } = card;

  // 时段行的 ‹ › 翻页箭头：点一下滚一屏（电脑上横向滚动条难用），手机触摸横滑不受影响。
  // 按需显隐：没溢出不显示，滚到头的那侧隐藏。
  const teesRef = useRef<HTMLDivElement | null>(null);
  const [canPage, setCanPage] = useState({ left: false, right: false });

  const updateArrows = () => {
    const container = teesRef.current;
    if (!container) return;
    const left = container.scrollLeft > 1;
    const right = container.scrollLeft + container.clientWidth < container.scrollWidth - 1;
    setCanPage((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  };

  useEffect(() => {
    updateArrows();
    // 窗口变宽可能让溢出消失（或反过来），箭头得跟着变
    window.addEventListener("resize", updateArrows);
    return () => window.removeEventListener("resize", updateArrows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teeTimes]);

  const page = (direction: 1 | -1) => {
    const container = teesRef.current;
    if (!container) return;
    // 滚 0.9 屏而不是整屏：边缘留半个 chip，让人看出「后面还有」
    container.scrollBy({ left: direction * container.clientWidth * 0.9, behavior: "smooth" });
  };
  // 拼得出预订链接就用真 <a>；拼不出退回按钮 + toast，不给一个点了没反应的链接。
  const url = bookingUrl(course, selectedIso);
  // 完整地址只取前两段（"7800 Vivian Dr, Vancouver"）；
  // 城市段单独包 .tt-addr-city，手机宽度下由 CSS 藏掉。
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
          <strong className="tt-card-name" title={course.name}>{shortCourseName(course.name)}</strong>
          {/* 评分/地址可能为 null：有就显示，没有整块不渲染，绝不显示 "⭐ 0" */}
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
      <div className="tt-tees-wrap">
        {canPage.left && (
          <button className="tt-tees-nav is-prev" aria-label={STRINGS.earlierTimes} onClick={() => page(-1)}>
            ‹
          </button>
        )}
        <div className="tt-tees" ref={teesRef} onScroll={updateArrows}>
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
                  {STRINGS.seatsText(teeTime.availableSeats)}
                </span>
              )}
            </div>
          );
          })}
        </div>
        {canPage.right && (
          <button className="tt-tees-nav is-next" aria-label={STRINGS.laterTimes} onClick={() => page(1)}>
            ›
          </button>
        )}
      </div>
    </div>
  );
}
