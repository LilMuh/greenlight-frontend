import { PRICE_BUCKETS, SORTS, SORT_DEFAULT, STRINGS, type PriceBucket, type SortBy } from "../strings";
import type { CourseView } from "../logic";

interface Props {
  courses: CourseView[];
  excludedCourseIds: string[];
  priceBucket: PriceBucket;
  sortBy: SortBy;
  filterOpen: boolean;
  countText: string;
  onToggleOpen: () => void;
  onReset: () => void;
  onToggleCourse: (course: CourseView) => void;
  onPrice: (bucket: PriceBucket) => void;
  onSort: (sort: SortBy) => void;
}

export function FilterBar(props: Props) {
  const { courses, excludedCourseIds, priceBucket, sortBy, filterOpen, countText } = props;

  // 面板收起时用户看不到自己选了什么，所以把生效的筛选摘成 chips 放在按钮旁边，
  // 数量同时当作按钮上的角标。默认值（Any / Earliest time / 球场全选）不算生效。
  const summaryChips: string[] = [];
  if (priceBucket !== "all") summaryChips.push(STRINGS.prices[priceBucket]);
  // 维护中的球场不算进「球场全选」这个默认值里：它们本来就排除掉了，
  // 拿它们当分母的话页面一打开就挂着一个「8 of 10 courses」的角标，看着像用户自己筛过。
  const selectableCourses = courses.filter((course) => !course.maintenance);
  const includedCourseCount = selectableCourses.filter(
    (course) => !excludedCourseIds.includes(course.id),
  ).length;
  if (selectableCourses.length && includedCourseCount < selectableCourses.length) {
    summaryChips.push(STRINGS.coursesChip(includedCourseCount, selectableCourses.length));
  }
  if (sortBy !== SORT_DEFAULT) summaryChips.push(STRINGS.sorts[sortBy]);

  return (
    <>
      <div className="tt-filter-row">
        <button className={`tt-filter-btn${filterOpen ? " is-open" : ""}`} onClick={props.onToggleOpen}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="21" y1="6" x2="3" y2="6" />
            <line x1="17" y1="12" x2="7" y2="12" />
            <line x1="13" y1="18" x2="11" y2="18" />
          </svg>
          <span>{STRINGS.filterTitle}</span>
          {summaryChips.length > 0 && <span className="tt-filter-badge">{summaryChips.length}</span>}
          <svg className="tt-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div className="tt-summary">
          {summaryChips.map((label) => (
            <span key={label} className="tt-summary-chip">{label}</span>
          ))}
        </div>
        <span className="tt-count">{countText}</span>
      </div>

      {filterOpen && (
        <div className="tt-panel">
          <div className="tt-section">
            <div className="tt-section-title">{STRINGS.courseFilterTitle}</div>
            <div className="tt-courses">
              {courses.length === 0 && <span className="tt-course-name">—</span>}
              {courses.map((course) => {
                const isIncluded = !excludedCourseIds.includes(course.id);
                return (
                  <div
                    key={course.id}
                    className={`tt-course${isIncluded ? " is-on" : ""}${course.maintenance ? " is-maintenance" : ""}`}
                    onClick={() => props.onToggleCourse(course)}
                  >
                    <span className="tt-box" />
                    <span className="tt-course-name">{course.name}</span>
                    {course.maintenance && <span className="tt-course-badge">{STRINGS.maintenanceBadge}</span>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="tt-section">
            <div className="tt-section-title">{STRINGS.priceFilterTitle}</div>
            <div className="tt-chips">
              {PRICE_BUCKETS.map((bucket) => (
                <button
                  key={bucket}
                  className={`tt-chip-btn${priceBucket === bucket ? " is-active" : ""}`}
                  onClick={() => props.onPrice(bucket)}
                >
                  {STRINGS.prices[bucket]}
                </button>
              ))}
            </div>
          </div>
          <div className="tt-section">
            <div className="tt-section-title">{STRINGS.sortFilterTitle}</div>
            <div className="tt-sorts">
              {SORTS.map((sortOption) => (
                <button
                  key={sortOption}
                  className={`tt-chip-btn${sortBy === sortOption ? " is-active" : ""}`}
                  onClick={() => props.onSort(sortOption)}
                >
                  {STRINGS.sorts[sortOption]}
                </button>
              ))}
            </div>
          </div>
          <div className="tt-panel-actions">
            <button className="tt-btn-reset" onClick={props.onReset}>{STRINGS.reset}</button>
            <button className="tt-btn-done" onClick={props.onToggleOpen}>{STRINGS.done}</button>
          </div>
        </div>
      )}
    </>
  );
}
