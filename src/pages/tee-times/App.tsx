// 时段查询页。数据只来自后端：连不上就显示空态 + 离线提示，绝不编数据。
// 所有筛选/排序都在浏览器端做。
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getCourses, getHealth, getTeeTimes } from "../../api";
import { STRINGS } from "./strings";
import { classifyFailure, computeCards, type CourseView } from "./logic";
import { createInitialState, reducer } from "./reducer";
import { DateStrip } from "./components/DateStrip";
import { FilterBar } from "./components/FilterBar";
import { CourseCard } from "./components/CourseCard";
import { Toast } from "./components/Toast";

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 弹一条会自动消失的提示；连续弹时新消息顶掉旧的、重新计时
  const showToast = useCallback((message: string, durationMs = 2200) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), durationMs);
  }, []);

  // 拉选中那天的时段并写进 state。成功返回 null，失败返回一句给人看的原因。
  const loadDay = useCallback(async (iso: string): Promise<string | null> => {
    dispatch({ type: "loadStart" });
    try {
      const teeTimeList = await getTeeTimes({ date: iso });
      dispatch({ type: "dayLoaded", teeTimeList });
      return null;
    } catch (error) {
      dispatch({ type: "dayFailed" });
      return classifyFailure(error);
    }
  }, []);

  // 页面打开时跑一次：健康检查（尽力而为）→ 球场清单 → 第一天的时段 → 失败则 toast。
  // 只记第一个失败原因：后面几个请求多半是同一根因的连锁反应。
  useEffect(() => {
    const firstIso = state.dates[0].iso;
    let firstReason: string | null = null;
    const note = (reason: string | null) => {
      if (reason) firstReason = firstReason ?? reason;
    };
    (async () => {
      try {
        await getHealth(); // 健康检查是尽力而为，失败只记一笔，不拦后面的请求
      } catch (error) {
        dispatch({ type: "failure" });
        note(classifyFailure(error));
      }
      try {
        const courses = await getCourses();
        if (Array.isArray(courses) && courses.length) dispatch({ type: "coursesLoaded", courses });
      } catch (error) {
        dispatch({ type: "failure" });
        note(classifyFailure(error));
      }
      note(await loadDay(firstIso));
      if (firstReason) showToast(firstReason, 2600);
    })();
    // 只在挂载时跑一遍；dates 挂载后不再变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 点日期条：切换选中日并拉那天的数据
  const handleSelectDate = (index: number) => {
    dispatch({ type: "date", index });
    void loadDay(state.dates[index].iso);
  };

  const handleToggleCourse = (course: CourseView) => {
    // 维护中的球场点不动，并说明原因
    if (course.maintenance) {
      showToast(STRINGS.maintenanceToast);
      return;
    }
    dispatch({ type: "course", id: course.id });
  };

  const selectedIso = state.dates[state.selectedDateIndex].iso;
  const cards = computeCards(state.dayData, state.excludedCourseIds, state.priceBucket, state.sortBy);
  const totalSlots = cards.reduce((total, card) => total + card.teeTimes.length, 0);
  const countText = state.loading ? STRINGS.loading : STRINGS.countText(cards.length, totalSlots);

  return (
    <>
      <div className="tt-header">
        <div className="tt-brand">
          <span className="tt-dot" />
          <div className="tt-brand-text">
            <strong>{STRINGS.appName}</strong>
            <small>{STRINGS.tagline}</small>
          </div>
        </div>
        <div className="tt-head-right">
          <div className="tt-nav">
            <a href="index.html" className="is-active">{STRINGS.navQuery}</a>
            <a href="config.html">{STRINGS.navWatch}</a>
          </div>
        </div>
      </div>

      <div className="tt-toolbar">
        <div className="tt-toolbar-inner">
          <DateStrip dates={state.dates} selectedIndex={state.selectedDateIndex} onSelect={handleSelectDate} />
          <FilterBar
            courses={state.courses}
            excludedCourseIds={state.excludedCourseIds}
            priceBucket={state.priceBucket}
            sortBy={state.sortBy}
            filterOpen={state.filterOpen}
            countText={countText}
            onToggleOpen={() => dispatch({ type: "filter" })}
            onReset={() => dispatch({ type: "reset" })}
            onToggleCourse={handleToggleCourse}
            onPrice={(value) => dispatch({ type: "price", value })}
            onSort={(value) => dispatch({ type: "sort", value })}
          />
        </div>
      </div>

      <div className="tt-body">
        {cards.length > 0 ? (
          // 加载中不清空列表、只把旧卡片调淡：避免切日期时闪白屏；只有首次加载才留空
          <div className={`tt-cards${state.loading ? " is-loading" : ""}`}>
            {cards.map((card) => (
              <CourseCard
                key={card.course.id}
                card={card}
                selectedIso={selectedIso}
                selectedChip={state.selectedChip}
                onChip={(key) => dispatch({ type: "chip", key })}
                onBookFallback={(name) => showToast(STRINGS.bookToast(name))}
              />
            ))}
          </div>
        ) : state.loading ? null : (
          <div className="tt-empty">{STRINGS.noResults}</div>
        )}
      </div>

      <Toast message={toast} />
    </>
  );
}
