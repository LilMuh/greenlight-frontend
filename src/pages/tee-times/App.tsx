// 时段查询页。数据只来自后端。连不上时显示空态和离线提示，不要编造数据。
// 所有筛选和排序都在浏览器端完成。
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

  // 弹出一条会自动消失的提示。连续弹出时，新消息替换旧消息，并重新计时
  const showToast = useCallback((message: string, durationMs = 2200) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), durationMs);
  }, []);

  // 取选中那天的时段，并写进 state。成功时返回 null，失败时返回一句给用户看的原因。
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

  // 页面打开时运行一次，依次执行：
  // 1. 健康检查（尽力而为）。
  // 2. 取球场清单。
  // 3. 取第一天的时段。
  // 4. 有失败时弹出 toast。
  // 只记录第一个失败原因。原因：后面几个请求的失败多半来自同一个根因。
  useEffect(() => {
    const firstIso = state.dates[0].iso;
    let firstReason: string | null = null;
    const note = (reason: string | null) => {
      if (reason) firstReason = firstReason ?? reason;
    };
    (async () => {
      try {
        await getHealth(); // 健康检查是尽力而为。失败时只记录原因，不阻止后面的请求
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
    // 只在挂载时运行一次。dates 挂载后不再变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 点击日期条：切换选中日，并取那天的数据
  const handleSelectDate = (index: number) => {
    dispatch({ type: "date", index });
    void loadDay(state.dates[index].iso);
  };

  const handleToggleCourse = (course: CourseView) => {
    // 维护中的球场不能切换，并提示原因
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
          // 加载中不清空列表，只把旧卡片调淡。原因：切换日期时不闪白屏。
          // 只有首次加载时列表为空
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
