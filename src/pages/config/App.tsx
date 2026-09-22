// Watch Alerts 页。数据只来自后端：连不上就显示空态 + 离线提示，绝不编数据。
// 一条 watch 对应一个球场：勾多个球场新建时发一次批量请求，后端逐球场各建一条。
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  createWatchConfigs, deleteWatchConfig, getCourses, getMatches,
  listWatchConfigs, updateWatchConfig,
} from "../../api";
import { STRINGS } from "./strings";
import { classifyError, isCourseInMaintenance, sortWeekdays, toDto, type CourseRef } from "./logic";
import { createInitialState, reducer } from "./reducer";
import { WatchForm } from "./components/WatchForm";
import { WatchCard } from "./components/WatchCard";
import { Toast } from "./components/Toast";

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const formRef = useRef<HTMLDivElement | null>(null);

  // 弹一条会自动消失的提示；连续弹时新消息顶掉旧的、重新计时
  const showToast = useCallback((message: string, durationMs = 2000) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), durationMs);
  }, []);

  // 把请求失败弹成 toast；连不上后端时顺带把页面标成离线
  const reportError = useCallback((error: unknown) => {
    const { offline, message } = classifyError(error);
    if (offline) dispatch({ type: "offline" });
    showToast(message, offline ? 2200 : 2600);
  }, [showToast]);

  // 拉一遍匹配结果，按 watchId 存命中数供卡片展示。只读——失败就当作 0，不打断页面。
  const loadMatches = useCallback(async () => {
    try {
      const matches = await getMatches();
      const hits: Record<number, number> = {};
      for (const match of matches || []) hits[match.watchId] = match.hitCount;
      dispatch({ type: "hitsLoaded", hits });
    } catch {
      dispatch({ type: "hitsLoaded", hits: {} });
    }
  }, []);

  // 页面打开时跑一次：球场清单 → 已有 watch 列表 → 命中数，各自失败置 offline，最后统一 toast
  useEffect(() => {
    (async () => {
      let sawOffline = false;
      try {
        const courses = await getCourses();
        if (Array.isArray(courses) && courses.length) dispatch({ type: "coursesLoaded", courses });
      } catch {
        sawOffline = true;
        dispatch({ type: "offline" }); // no courses to show; leave the list empty
      }
      try {
        const watches = await listWatchConfigs();
        dispatch({ type: "watchesLoaded", watches: watches || [] });
      } catch {
        sawOffline = true;
        dispatch({ type: "offline" }); // backend down — show nothing, not fake data
      }
      await loadMatches();
      if (sawOffline) showToast(STRINGS.offline, 2600);
    })();
    // 只在挂载时跑一遍
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 勾选球场（新建态多选）。编辑态不给改球场：换球场等于换成另一条 watch，
  // 后端会拒（WATCH_COURSE_IMMUTABLE），这里直接点不动并说明原因。
  const handleToggleCourse = (course: CourseRef) => {
    if (state.editingId != null) {
      showToast(STRINGS.courseLocked, 2600);
      return;
    }
    // 同理，维护中的球场也别等后端 COURSE_IN_MAINTENANCE 才说
    if (course.maintenance) {
      showToast(STRINGS.maintenanceToast, 2600);
      return;
    }
    dispatch({ type: "course", id: course.id });
  };

  // 提交表单：先过三道本地校验，再按「编辑单条 / 批量新建」调后端，成功后刷新命中数
  const submitForm = async () => {
    if (!state.formEmail || state.formCourses.length === 0) {
      showToast(STRINGS.needCourseEmail, 2200);
      return;
    }
    if (state.formWeekdays.length === 0) {
      showToast(STRINGS.needWeekday, 2200);
      return;
    }
    // 零填充的 "HH:MM" 字符串比较就是时间先后；结束不晚于开始的窗口永远不命中，挡在这里
    if (state.formTimeEnd <= state.formTimeStart) {
      showToast(STRINGS.needTimeOrder, 2400);
      return;
    }
    const config = {
      weekdays: sortWeekdays(state.formWeekdays),
      timeStart: state.formTimeStart,
      timeEnd: state.formTimeEnd,
      players: state.formPlayers,
      maxPrice: state.formMaxPrice,
      email: state.formEmail,
    };
    try {
      if (state.editingId != null) {
        const current = state.watches.find((watch) => watch.id === state.editingId);
        const dto = { id: state.editingId, courseId: state.formCourses[0], active: current ? current.active : true, ...config };
        const saved = await updateWatchConfig(state.editingId, dto);
        dispatch({ type: "updated", watch: saved });
      } else {
        const created = await createWatchConfigs({ courseIds: state.formCourses, active: true, ...config });
        dispatch({ type: "created", watches: created || [] });
      }
      await loadMatches();
      showToast(STRINGS.saved, 2000);
    } catch (error) {
      reportError(error);
    }
  };

  // 点 Edit 后平滑滚到表单：列表长了表单多半在屏幕外，不滚过去看着像没反应。
  const startEdit = (watchId: number) => {
    dispatch({ type: "edit", id: watchId });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // 删除一条 watch：后端确认成功才从列表移除
  const deleteWatch = async (watchId: number) => {
    try {
      await deleteWatchConfig(watchId);
    } catch (error) {
      reportError(error);
      return;
    }
    dispatch({ type: "deleted", id: watchId });
    showToast(STRINGS.deleted, 1800);
  };

  // 启停开关：界面先翻（乐观更新），后端失败再翻回来
  const toggleActive = async (watchId: number) => {
    const watch = state.watches.find((candidate) => candidate.id === watchId);
    if (!watch) return;
    // 维护中的球场开不回来（后端会 409），先拦一道；关掉照常放行
    if (!watch.active && isCourseInMaintenance(state.courses, watch.courseId)) {
      showToast(STRINGS.maintenanceToast, 2600);
      return;
    }
    const updated = { ...watch, active: !watch.active };
    dispatch({ type: "setWatchActive", id: watchId, active: updated.active });
    try {
      await updateWatchConfig(watchId, toDto(updated));
    } catch (error) {
      // 失败就把开关翻回去，别停在一个库里没有的状态
      dispatch({ type: "setWatchActive", id: watchId, active: watch.active });
      reportError(error);
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
            <a href="config.html" className="is-active">{STRINGS.navWatch}</a>
          </div>
        </div>
      </div>

      <div className="wa-body">
          <WatchForm
            formRef={formRef}
            state={state}
            onToggleCourse={handleToggleCourse}
            onWeekday={(code) => dispatch({ type: "weekday", code })}
            onPlayers={(count) => dispatch({ type: "players", count })}
            onPrice={(value) => dispatch({ type: "price", value })}
            onEmail={(value) => dispatch({ type: "email", value })}
            onTime={(which, value) => dispatch({ type: "time", which, value })}
            onSubmit={submitForm}
            onCancel={() => dispatch({ type: "cancel" })}
          />

        <div className="wa-list">
          <div className="wa-count">{STRINGS.countText(state.watches.length)}</div>
          {state.watches.length ? (
            <div className="wa-cards">
              {state.watches.map((watch) => (
                <WatchCard
                  key={watch.id}
                  watch={watch}
                  isOpen={state.expandedWatchIds.includes(watch.id)}
                  hitCount={state.hitsByWatchId[watch.id] ?? 0}
                  inMaintenance={isCourseInMaintenance(state.courses, watch.courseId)}
                  onExpand={(id) => dispatch({ type: "expand", id })}
                  onToggleActive={toggleActive}
                  onEdit={startEdit}
                  onDelete={deleteWatch}
                />
              ))}
            </div>
          ) : (
            <div className="wa-empty">{STRINGS.noWatches}</div>
          )}
        </div>
      </div>

      <Toast message={toast} />
    </>
  );
}
