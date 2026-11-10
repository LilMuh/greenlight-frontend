// 「我的订场账号」（D-13，D-18 修订）：未绑定时是占建任务表单位置的绑定卡片（AccountCard）；绑定后是标着 Booking account 的
// 小卡片（AccountChip：邮箱 · 状态 · Unlink），VALID 时放在任务区上方，验证中 / Invalid 时留在表单位置。页面没有重新验证和改密码入口。
// 密码只活在表单组件的 state 与一次提交的局部变量里：加密完就清空；不进 reducer、不进任何浏览器存储、
// 不拼进 URL、没有任何控制台输出（D-05、T-06-41）。后端永远只收到 {keyId, loginEmail, ciphertext}。
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ApiError, getBookingKey, getMyBookingAccount, linkBookingAccount, listBookingAccounts,
  unlinkBookingAccount, type BookingAccountAdminDto, type BookingAccountDto, type UserDto,
} from "../../api";
import { classifyError } from "../config/logic";
import { BookingKeyError, encryptCredentials } from "./accountCrypto";
import {
  POLL_INTERVAL_MS, POLL_MAX_MS, cardState, chipStatus, formatVerifiedAt, isVerifying, reasonHint, shouldKeepPolling,
} from "./accountCardLogic";
import { createBlockedReason } from "./logic";
import { STRINGS } from "./strings";

type Props = {
  user: UserDto;
  account: BookingAccountDto | null | undefined; // undefined = 还没拿到
  loadFailed: boolean;
  onAccountChange: (account: BookingAccountDto | null) => void;
  onSignedOut: () => void;
  onUnlinked: () => void; // 解绑成功：待执行任务已被后端置为 FAILED，页面刷新任务列表
};

/** 邮箱 + 密码的绑定表单。 */
function CredentialForm(props: {
  busy: boolean;
  submitLabel: string;
  onSubmit: (email: string, password: string, wipe: () => void) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    props.onSubmit(email, password, () => setPassword(""));
  };
  return (
    <form className="wa-bk-acct-form" onSubmit={submit}>
      <div className="wa-field">
        <label className="wa-label" htmlFor="wa-bk-acct-email">{STRINGS.accountEmailLabel}</label>
        <input
          id="wa-bk-acct-email"
          type="email"
          className="wa-email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="wa-field">
        <label className="wa-label" htmlFor="wa-bk-acct-password">{STRINGS.accountPasswordLabel}</label>
        <input
          id="wa-bk-acct-password"
          type="password"
          className="wa-email"
          autoComplete="off"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <div className="wa-hint">{STRINGS.accountPasswordNote}</div>
      </div>
      <div className="wa-actions">
        <button type="submit" className="wa-submit" disabled={props.busy}>
          {props.busy ? STRINGS.linking : props.submitLabel}
        </button>
      </div>
    </form>
  );
}

/** 管理员只读总览（D-12）：每个人的绑定状态，没有任何秘密字段，也没有绑定表单。窄屏每项是堆叠的小块，不横向溢出。 */
export function AdminOverview(props: { onSignedOut: () => void }) {
  const [rows, setRows] = useState<BookingAccountAdminDto[] | null | "failed">(null);
  useEffect(() => {
    let cancelled = false;
    listBookingAccounts()
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((error) => {
        if (cancelled) return;
        if (classifyError(error).signedOut) props.onSignedOut();
        setRows("failed");
      });
    return () => {
      cancelled = true;
    };
    // 只在挂载时拉一遍
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section className="wa-form wa-bk-acct is-admin" aria-label={STRINGS.adminAccountsTitle}>
      <div className="wa-form-title">{STRINGS.adminAccountsTitle}</div>
      <div className="wa-hint">{STRINGS.adminAccountsHint}</div>
      {rows === null && <div className="wa-hint">{STRINGS.adminAccountsLoading}</div>}
      {rows === "failed" && <div className="wa-bk-acct-note">{STRINGS.adminAccountsFailed}</div>}
      {Array.isArray(rows) && rows.length === 0 && <div className="wa-hint">{STRINGS.adminAccountsEmpty}</div>}
      {Array.isArray(rows) && rows.length > 0 && (
        <div className="wa-bk-admin-list">
          {rows.map((row) => {
            const stateLabel = row.verifying || row.reason === "NOT_VERIFIED"
              ? STRINGS.statusVerifying
              : row.status === "VALID" ? STRINGS.statusValid : STRINGS.statusInvalid;
            const stateClass = row.verifying || row.reason === "NOT_VERIFIED" ? "verifying" : row.status === "VALID" ? "valid" : "invalid";
            const verified = formatVerifiedAt(row.verifiedAt);
            return (
              <div className="wa-bk-admin-item" key={row.id}>
                <div className="wa-bk-acct-row">
                  <span className="wa-label">{STRINGS.adminUserLabel}</span>
                  <span className="wa-bk-acct-value">{row.userLoginEmail}</span>
                </div>
                <div className="wa-bk-acct-row">
                  <span className="wa-label">{STRINGS.accountEmailLabel}</span>
                  <span className="wa-bk-acct-value">{row.loginEmail}</span>
                </div>
                <div className="wa-bk-acct-row">
                  <span className="wa-label">{STRINGS.adminKindLabel}</span>
                  <span className="wa-bk-acct-value">{row.kind === "SHARED" ? "Shared" : "Own"}</span>
                  <span className={`wa-bk-status is-acct-${stateClass}`}>{stateLabel}</span>
                </div>
                {row.classCode && (
                  <div className="wa-bk-acct-row">
                    <span className="wa-label">{STRINGS.accountClassLabel}</span>
                    <span className="wa-bk-acct-value">{row.classCode}</span>
                  </div>
                )}
                {verified && (
                  <div className="wa-bk-acct-row">
                    <span className="wa-label">{STRINGS.accountVerifiedLabel}</span>
                    <span className="wa-bk-acct-value">{verified}</span>
                  </div>
                )}
                {row.status === "NEEDS_ACTION" && stateClass !== "verifying" && (
                  <div className="wa-bk-acct-note">{reasonHint(row.reason)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

type ActionProps = Pick<Props, "account" | "onAccountChange" | "onSignedOut" | "onUnlinked">;

/**
 * 链接 / 解绑与验证结果轮询（绑定卡片与小卡片共用）。
 * 账号处于验证中就轮询（3 秒一次、最多 3 分钟，超时只提示稍后回来看）。
 * link 成功后调 onAccountChange 并开始轮询。
 * 密码只在 CredentialForm 的 state 里，加密后立即 wipe，不进 reducer、存储与 console。
 */
function useAccountActions(props: ActionProps) {
  const { account } = props;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pollStart, setPollStart] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  // 轮询里要调用最新的回调，但回调的身份变化不该重启轮询
  const latest = useRef(props);
  latest.current = props;

  // 页面一打开账号就在验证中（上次提交后离开又回来）：也开始轮询
  useEffect(() => {
    if (account && isVerifying(account) && pollStart === null && !timedOut) setPollStart(Date.now());
  }, [account, pollStart, timedOut]);

  // 每 3 秒查一次，最多 3 分钟。超时只提示稍后回来看，不算错误；网络抖动不中断，ApiError 才停
  useEffect(() => {
    if (pollStart === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const next = await getMyBookingAccount();
        if (cancelled) return;
        latest.current.onAccountChange(next);
        if (shouldKeepPolling(next, pollStart, Date.now())) {
          timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
          return;
        }
        setPollStart(null);
        if (next && isVerifying(next)) setTimedOut(true);
      } catch (error) {
        if (cancelled) return;
        const { offline, signedOut, message: text } = classifyError(error);
        if (offline && Date.now() - pollStart < POLL_MAX_MS) {
          timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
          return;
        }
        setPollStart(null);
        if (signedOut) latest.current.onSignedOut();
        else setMessage(text);
      }
    };
    timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pollStart]);

  // 加密前就被拒绝的错误（BookingKeyError）要在 classifyError 之前处理：它不是 ApiError，会被当成「后端离线」
  const describeError = (error: unknown): string => {
    if (error instanceof BookingKeyError) {
      return error.code === "TOO_LONG" ? STRINGS.credentialsTooLong : STRINGS.keyUntrusted;
    }
    const { signedOut, message: text } = classifyError(error);
    if (signedOut) props.onSignedOut();
    return text;
  };

  const link = async (email: string, password: string, wipe: () => void) => {
    if (!email.trim() || !password) {
      setMessage(STRINGS.needEmailPassword);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      // 每次提交都重新取公钥：密钥轮换后页面也不会拿着旧钥匙
      const key = await getBookingKey();
      const sealed = await encryptCredentials(key, email, password);
      wipe(); // 密文已经有了，明文立刻从表单 state 里清掉
      const next = await linkBookingAccount({
        keyId: sealed.keyId,
        loginEmail: email.trim(),
        ciphertext: sealed.ciphertext,
      });
      props.onAccountChange(next);
      setTimedOut(false);
      setPollStart(Date.now());
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  // 解绑：二次确认，写明后果（该账号的待执行任务会失败并通知创建者；记录保留，之后可用同一账号重新绑定恢复，D-19）。成功后回到未绑定的卡片
  const unlink = async () => {
    if (!window.confirm(STRINGS.unlinkConfirm)) return;
    setBusy(true);
    setMessage("");
    try {
      await unlinkBookingAccount();
      setPollStart(null);
      setTimedOut(false);
      props.onAccountChange(null);
      props.onUnlinked();
    } catch (error) {
      if (error instanceof ApiError && error.code === "BOOKING_ACCOUNT_NOT_FOUND") props.onAccountChange(null);
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  return { busy, message, timedOut, link, unlink };
}

/**
 * 没有可用账号时占建任务表单位置的卡片（D-18 修订 D-13）：还没拿到 → 加载提示；未绑定 → 链接表单；
 * 已有记录（验证中 / Invalid）→ 和 VALID 时同一张小卡片（AccountChip）。管理员不用这个组件（见 AdminOverview）；
 * VALID 时什么都不渲染（App 把 AccountChip 放到任务区上方）。
 */
export function AccountCard(props: Props) {
  const { account } = props;
  if (account && cardState(account, false) === "valid") return null;
  // 各自挂载、各自一份轮询：绑定成功后绑定卡片卸载，小卡片接手验证中的轮询
  return account ? <AccountChip {...props} /> : <LinkCard {...props} />;
}

/** 未绑定（或还没拿到账号）时的绑定卡片。 */
function LinkCard(props: Props) {
  const { account, user } = props;
  const actions = useAccountActions(props);
  // 卡片顶部的一行提示：去绑定才能建任务（D-07）
  const reason = createBlockedReason(user, account);
  return (
    <section className="wa-form wa-bk-acct is-compact" aria-label={STRINGS.accountTitle}>
      <div className="wa-bk-chip-label">{STRINGS.accountTitle}</div>
      {reason && <div className="wa-hint" role="status">{reason}</div>}

      {account === undefined && props.loadFailed && <div className="wa-bk-acct-note">{STRINGS.accountLoadFailed}</div>}
      {account === undefined && !props.loadFailed && <div className="wa-hint">{STRINGS.accountLoading}</div>}

      {account === null && (
        <CredentialForm busy={actions.busy} submitLabel={STRINGS.linkBtn} onSubmit={(e, p, w) => void actions.link(e, p, w)} />
      )}

      {actions.message && <div className="wa-bk-acct-note" role="alert">{actions.message}</div>}
    </section>
  );
}

/**
 * 已绑定账号的小卡片（用户 2026-11-10 指定）：顶部小标签 Booking account，一行「登录邮箱 · 状态 · Unlink」。
 * 没有改密码入口：Invalid 时只显示原因小字，处理方式是 Unlink 后重新绑定（D-19：同一账号重绑恢复原记录）。
 * 验证中 Unlink 不可点。邮箱和状态都不是链接，也不带下划线（iOS 的邮箱自动识别在 booking.html 里关掉）。
 */
export function AccountChip(props: Props) {
  const actions = useAccountActions(props);
  const { account } = props;
  if (!account) return null;
  const status = chipStatus(account);
  return (
    <section className="wa-bk-chip" aria-label={STRINGS.accountTitle}>
      <div className="wa-bk-chip-label">{STRINGS.accountTitle}</div>
      <div className="wa-bk-chip-row">
        <span className="wa-bk-chip-email">{account.loginEmail}</span>
        <span className={`wa-bk-status is-acct-${status.tone}`}>{status.label}</span>
        <button
          type="button"
          className="wa-bk-chip-unlink"
          disabled={actions.busy || status.tone === "verifying"}
          onClick={() => void actions.unlink()}
        >
          {STRINGS.unlinkBtn}
        </button>
      </div>
      {status.tone === "verifying" && (
        <div className="wa-bk-chip-hint">{actions.timedOut ? STRINGS.accountStillVerifying : STRINGS.accountVerifying}</div>
      )}
      {/* D-16：这处中文提示是锁定要求 */}
      {status.tone === "invalid" && <div className="wa-bk-chip-hint is-danger">{reasonHint(account.reason)}</div>}
      {actions.message && <div className="wa-bk-chip-hint is-danger" role="alert">{actions.message}</div>}
    </section>
  );
}
