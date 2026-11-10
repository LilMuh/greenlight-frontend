// 「我的订场账号」（D-13，D-18 修订）：没有 VALID 账号时是占建任务表单位置的紧凑卡片（AccountCard：绑定 / 验证中 /
// Needs action，Needs action 时直接在卡片里重新输入密码，页面没有重新验证按钮）；VALID 之后缩成页面顶部一行小字（AccountLine）。
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
  POLL_INTERVAL_MS, POLL_MAX_MS, askForPassword, cardState, formatVerifiedAt, isVerifying, lineStatusLabel, reasonHint,
  shouldKeepPolling,
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

/** 邮箱 + 密码的表单。lockedEmail 有值时邮箱只读（同一个账号重新输入密码）。 */
function CredentialForm(props: {
  lockedEmail?: string;
  busy: boolean;
  submitLabel: string;
  onSubmit: (email: string, password: string, wipe: () => void) => void;
}) {
  const [email, setEmail] = useState(props.lockedEmail ?? "");
  const [password, setPassword] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    props.onSubmit(props.lockedEmail ?? email, password, () => setPassword(""));
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
          readOnly={props.lockedEmail !== undefined}
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
              : row.status === "VALID" ? STRINGS.statusValid : STRINGS.statusNeedsAction;
            const stateClass = row.verifying || row.reason === "NOT_VERIFIED" ? "verifying" : row.status === "VALID" ? "valid" : "needsAction";
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
                  <span className={`wa-bk-status is-acct-${stateClass.toLowerCase()}`}>{stateLabel}</span>
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
 * 链接 / 解绑与验证结果轮询（卡片与一行小字共用）。
 * 账号处于验证中就轮询（3 秒一次、最多 3 分钟，超时只提示稍后回来看）。
 * link 成功后调 onAccountChange、开始轮询、再调可选的 onLinked（一行小字用它收起小表单）。
 * 密码只在 CredentialForm 的 state 里，加密后立即 wipe，不进 reducer、存储与 console。
 */
function useAccountActions(props: ActionProps, options: { onLinked?: () => void } = {}) {
  const { account } = props;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pollStart, setPollStart] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  // 轮询里要调用最新的回调，但回调的身份变化不该重启轮询
  const latest = useRef(props);
  latest.current = props;
  const latestOptions = useRef(options);
  latestOptions.current = options;

  // 页面一打开账号就在验证中（上次提交后离开又回来，或一行小字提交后换成卡片）：也开始轮询
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
      latestOptions.current.onLinked?.();
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
 * 没有 VALID 账号时占建任务表单位置的紧凑卡片（D-18 修订 D-13）：未绑定 → 链接表单；验证中 → 只显示进度；
 * NEEDS_ACTION → 锁定邮箱的重新输入密码表单 + Unlink（BAD_CREDENTIALS 提示重输密码，其他原因提示联系管理员但仍可重输）。
 * 管理员不用这个组件（见 AdminOverview）；VALID 时什么都不渲染（由 AccountLine 接手）。
 */
export function AccountCard(props: Props) {
  const { account, user } = props;
  const actions = useAccountActions(props);
  const state = cardState(account, false);
  if (account !== undefined && (state === "valid" || state === "admin")) return null;

  // 卡片顶部的一行提示：没绑定 / 验证中 / 需要处理各一句（建任务的前提，D-07）
  const reason = createBlockedReason(user, account);
  return (
    <section className="wa-form wa-bk-acct is-compact" aria-label={STRINGS.accountTitle}>
      <div className="wa-form-title">{STRINGS.accountTitle}</div>
      {reason && <div className="wa-hint" role="status">{reason}</div>}

      {account === undefined && props.loadFailed && <div className="wa-bk-acct-note">{STRINGS.accountLoadFailed}</div>}
      {account === undefined && !props.loadFailed && <div className="wa-hint">{STRINGS.accountLoading}</div>}

      {account !== undefined && state === "none" && (
        <CredentialForm busy={actions.busy} submitLabel={STRINGS.linkBtn} onSubmit={(e, p, w) => void actions.link(e, p, w)} />
      )}

      {account && state === "verifying" && (
        <div className="wa-bk-acct-body">
          <div className="wa-bk-acct-row">
            <span className="wa-bk-acct-value">{account.loginEmail}</span>
            <span className="wa-bk-status is-acct-verifying">{STRINGS.statusVerifying}</span>
          </div>
          <div className="wa-hint">{actions.timedOut ? STRINGS.accountStillVerifying : STRINGS.accountVerifying}</div>
        </div>
      )}

      {account && state === "needsAction" && (
        <div className="wa-bk-acct-body">
          <div className="wa-bk-acct-row">
            <span className="wa-bk-acct-value">{account.loginEmail}</span>
            <span className="wa-bk-status is-acct-needsaction">{STRINGS.statusNeedsAction}</span>
          </div>
          {/* D-16：这处中文提示是锁定要求 */}
          <div className="wa-bk-acct-note">{reasonHint(account.reason)}</div>
          {!askForPassword(account.reason) && <div className="wa-hint">{STRINGS.accountRetryNote}</div>}
          <CredentialForm
            key={account.loginEmail}
            lockedEmail={account.loginEmail}
            busy={actions.busy}
            submitLabel={STRINGS.changePasswordSubmit}
            onSubmit={(e, p, w) => void actions.link(e, p, w)}
          />
          <div>
            <button type="button" className="wa-linkbtn" disabled={actions.busy} onClick={() => void actions.unlink()}>
              {STRINGS.unlinkBtn}
            </button>
          </div>
        </div>
      )}

      {actions.message && <div className="wa-bk-acct-note" role="alert">{actions.message}</div>}
    </section>
  );
}

/**
 * VALID 之后页面顶部的一行小字（D-18 修订 D-13）：登录邮箱 · Valid（SHARED 显示 Shared）· Change password（SHARED 没有）· Unlink。
 * 点 Change password 才在行下方展开锁定邮箱的小表单；提交后账号回到验证中，页面换成卡片显示进度。
 */
export function AccountLine(props: Props) {
  const [open, setOpen] = useState(false);
  const actions = useAccountActions(props, { onLinked: () => setOpen(false) });
  const { account } = props;
  if (!account) return null;
  const verifying = isVerifying(account);
  const disabled = actions.busy || verifying;
  const canChange = account.kind === "OWN";
  return (
    <div className="wa-bk-acct-line-wrap" role="group" aria-label={STRINGS.accountTitle}>
      <div className="wa-bk-acct-line">
        <span className="wa-bk-acct-value">{account.loginEmail}</span>
        <span aria-hidden="true">·</span>
        <span className={`wa-bk-status is-acct-${verifying ? "verifying" : "valid"}`}>{lineStatusLabel(account)}</span>
        {canChange && (
          <>
            <span aria-hidden="true">·</span>
            <button type="button" className="wa-linkbtn" disabled={disabled} onClick={() => setOpen((value) => !value)}>
              {open ? STRINGS.closeFormBtn : STRINGS.changePasswordBtn}
            </button>
          </>
        )}
        <span aria-hidden="true">·</span>
        <button type="button" className="wa-linkbtn" disabled={disabled} onClick={() => void actions.unlink()}>
          {STRINGS.unlinkBtn}
        </button>
      </div>
      {open && canChange && (
        <div className="wa-bk-acct-line-form">
          <CredentialForm
            key={account.loginEmail}
            lockedEmail={account.loginEmail}
            busy={actions.busy}
            submitLabel={STRINGS.changePasswordSubmit}
            onSubmit={(e, p, w) => void actions.link(e, p, w)}
          />
        </div>
      )}
      {actions.message && <div className="wa-bk-acct-note" role="alert">{actions.message}</div>}
    </div>
  );
}
