// Watch Alerts 页。要登录：没登录只显示登录面板；登录后只看得到、改得了自己的 watch。
// 管理员例外：看得到、改得了所有人的，列表按主人分组。
// 一条 watch 对应一个球场：勾多个球场新建时发一次批量请求，后端逐球场各建一条。
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  createWatchConfigs, deleteWatchConfig, getCourses, getMatches, getMe,
  listWatchConfigs, logout, updateWatchConfig, type LoginResultDto, type UserDto,
} from "../../api";
import { clearToken, getToken, setToken } from "../../auth";
import { STRINGS } from "./strings";
import {
  classifyError, groupByOwner, isCourseInMaintenance, sortWeekdays, toDto,
  type CourseRef, type WatchView,
} from "./logic";
import { createInitialState, reducer } from "./reducer";
import { WatchForm } from "./components/WatchForm";
import { WatchCard } from "./components/WatchCard";
import { LoginPanel } from "./components/LoginPanel";
import { AccountPanel } from "./components/AccountPanel";
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

  // 把请求失败弹成 toast；连不上后端时标成离线，会话过期时回到登录态
  const reportError = useCallback((error: unknown) => {
    const { offline, signedOut, message } = classifyError(error);
    if (offline) dispatch({ type: "offline" });
    if (signedOut) dispatch({ type: "signedOut" });
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

  // 登录态确定之后：进入登录态，再拉这个人的 watch 和命中数
  const enter = useCallback(async (user: UserDto) => {
    dispatch({ type: "signedIn", user });
    try {
      dispatch({ type: "watchesLoaded", watches: await listWatchConfigs() });
    } catch (error) {
      reportError(error);
      return;
    }
    await loadMatches();
  }, [loadMatches, reportError]);

  // 页面打开时：球场清单（公开）和登录态并行确认。本地有令牌就问后端它还有没有效。
  useEffect(() => {
    getCourses()
      .then((courses) => {
        if (Array.isArray(courses) && courses.length) dispatch({ type: "coursesLoaded", courses });
      })
      .catch(() => dispatch({ type: "offline" }));

    if (!getToken()) {
      dispatch({ type: "signedOut" });
      return;
    }
    getMe()
      .then(enter)
      .catch((error) => {
        dispatch({ type: "signedOut" });
        const { offline } = classifyError(error);
        if (offline) {
          dispatch({ type: "offline" });
          showToast(STRINGS.offline, 2600);
        }
      });
    // 只在挂载时跑一遍
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignedIn = (result: LoginResultDto) => {
    setToken(result.token);
    void enter(result.user);
  };

  // 登出：后端撤销失败也照样清本地，别让人卡在「退不出去」
  const handleSignOut = async () => {
    try {
      await logout();
    } catch {
      // 忽略
    }
    clearToken();
    dispatch({ type: "signedOut" });
    showToast(STRINGS.signedOut, 1800);
  };

  const handleUserUpdated = (user: UserDto, message?: string) => {
    dispatch({ type: "userUpdated", user });
    if (message) showToast(message, 2200);
  };

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

  // 提交表单：先过本地校验，再按「编辑单条 / 批量新建」调后端，成功后刷新命中数
  const submitForm = async () => {
    if (state.formCourses.length === 0) {
      showToast(STRINGS.needCourse, 2200);
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

  const { user } = state;
  // 管理员才分组；普通用户的列表只有自己的，和以前一样平铺
  const groups = user?.admin ? groupByOwner(state.watches, user) : null;

  const renderCard = (watch: WatchView) => (
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
  );

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
          {user && (
            <div className="wa-user">
              <span className="wa-user-email">{user.loginEmail}</span>
              <button type="button" className="wa-linkbtn" onClick={() => void handleSignOut()}>
                {STRINGS.signOut}
              </button>
            </div>
          )}
          <div className="wa-nav">
            <a href="index.html">{STRINGS.navQuery}</a>
            <a href="config.html" className="is-active">{STRINGS.navWatch}</a>
          </div>
        </div>
      </div>

      {/* user === undefined：还在确认登录态，先不渲染，免得登录面板一闪而过 */}
      {user === null && (
        <div className="wa-body wa-body-center">
          <LoginPanel onSignedIn={handleSignedIn} onError={reportError} />
        </div>
      )}

      {user && (
        <div className="wa-body">
          <div className="wa-side">
            <WatchForm
              formRef={formRef}
              state={state}
              onToggleCourse={handleToggleCourse}
              onWeekday={(code) => dispatch({ type: "weekday", code })}
              onPlayers={(count) => dispatch({ type: "players", count })}
              onPrice={(value) => dispatch({ type: "price", value })}
              onTime={(which, value) => dispatch({ type: "time", which, value })}
              onSubmit={submitForm}
              onCancel={() => dispatch({ type: "cancel" })}
            />
            <AccountPanel user={user} onUserUpdated={handleUserUpdated} onError={reportError} />
          </div>

          <div className="wa-list">
            <div className="wa-count">
              {groups
                ? STRINGS.countTextAdmin(state.watches.length, groups.length)
                : STRINGS.countText(state.watches.length)}
            </div>
            {state.watches.length ? (
              groups ? (
                groups.map((group) => (
                  <section key={group.ownerId} className="wa-group">
                    <div className="wa-group-head">
                      {group.isMe ? STRINGS.ownerYou(group.ownerEmail) : group.ownerEmail}
                    </div>
                    <div className="wa-cards">{group.watches.map(renderCard)}</div>
                  </section>
                ))
              ) : (
                <div className="wa-cards">{state.watches.map(renderCard)}</div>
              )
            ) : (
              <div className="wa-empty">{STRINGS.noWatches}</div>
            )}
          </div>
        </div>
      )}

      <Toast message={toast} />
    </>
  );
}
