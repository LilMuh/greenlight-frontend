// 「我的订场账号」卡片（D-13）：绑定 / 验证中 / Valid / Needs action。
// 密码只活在表单组件的 state 与一次提交的局部变量里：加密完就清空；不进 reducer、不进任何浏览器存储、
// 不拼进 URL、没有任何控制台输出（D-05、T-06-41）。后端永远只收到 {keyId, loginEmail, ciphertext}。
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ApiError, getBookingKey, getMyBookingAccount, linkBookingAccount, listBookingAccounts, reverifyBookingAccount,
  unlinkBookingAccount, type BookingAccountAdminDto, type BookingAccountDto, type UserDto,
} from "../../api";
import { classifyError } from "../config/logic";
import { BookingKeyError, encryptCredentials } from "./accountCrypto";
import {
  POLL_INTERVAL_MS, POLL_MAX_MS, askForPassword, cardState, formatVerifiedAt, isVerifying, reasonHint,
  shouldKeepPolling,
} from "./accountCardLogic";
import { STRINGS } from "./strings";

type Props = {
  user: UserDto;
  account: BookingAccountDto | null | undefined; // undefined = 还没拿到
  loadFailed: boolean;
  onAccountChange: (account: BookingAccountDto | null) => void;
  onSignedOut: () => void;
  onUnlinked: () => void; // 解绑成功：待执行任务已被后端置为 FAILED，页面刷新任务列表
};

/** 邮箱 + 密码的表单。lockedEmail 有值时邮箱只读（同一个账号改密码，Task 2）。 */
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
function AdminOverview(props: { onSignedOut: () => void }) {
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

export function AccountCard(props: Props) {
  // 管理员只读总览（D-12）：没有绑定表单；hooks 都在子组件里，这里提前返回不破坏 hooks 顺序
  if (props.user.admin) return <AdminOverview onSignedOut={props.onSignedOut} />;
  return <OwnAccountCard {...props} />;
}

function OwnAccountCard(props: Props) {
  const { account, user } = props;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pollStart, setPollStart] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [changing, setChanging] = useState(false); // 手动展开「改密码」表单
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
      setChanging(false);
      setPollStart(Date.now());
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  // 重新验证：202 之后开始轮询。没有绑定（404）说明列表是旧的，回到未绑定
  const reverify = async () => {
    setBusy(true);
    setMessage("");
    try {
      const next = await reverifyBookingAccount();
      props.onAccountChange(next);
      setTimedOut(false);
      setPollStart(Date.now());
    } catch (error) {
      if (error instanceof ApiError && error.code === "BOOKING_ACCOUNT_NOT_FOUND") props.onAccountChange(null);
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  // 解绑：二次确认，写明后果（该账号的待执行任务会失败并通知创建者、浏览器 profile 被删除）。成功后回到未绑定表单
  const unlink = async () => {
    if (!window.confirm(STRINGS.unlinkConfirm)) return;
    setBusy(true);
    setMessage("");
    try {
      await unlinkBookingAccount();
      setPollStart(null);
      setTimedOut(false);
      setChanging(false);
      props.onAccountChange(null);
      props.onUnlinked();
    } catch (error) {
      if (error instanceof ApiError && error.code === "BOOKING_ACCOUNT_NOT_FOUND") props.onAccountChange(null);
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  const state = cardState(account, user.admin);
  // BAD_CREDENTIALS 默认展开改密码表单（D-16）；其余情况用户点「Change password」才展开。验证中不给表单
  const askedForPassword = state === "needsAction" && askForPassword(account?.reason);
  const showForm = !!account && account.kind === "OWN" && state !== "verifying" && (changing || askedForPassword);
  return (
    <section className="wa-form wa-bk-acct" aria-label={STRINGS.accountTitle}>
      <div className="wa-form-title">{STRINGS.accountTitle}</div>

      {props.loadFailed && account === undefined && <div className="wa-bk-acct-note">{STRINGS.accountLoadFailed}</div>}
      {!props.loadFailed && account === undefined && <div className="wa-hint">{STRINGS.accountLoading}</div>}

      {account !== undefined && state === "none" && (
        <>
          <div className="wa-hint">{STRINGS.accountIntro}</div>
          <CredentialForm busy={busy} submitLabel={STRINGS.linkBtn} onSubmit={(e, p, w) => void link(e, p, w)} />
        </>
      )}

      {account && state !== "none" && state !== "admin" && (
        <div className="wa-bk-acct-body">
          <div className="wa-bk-acct-row">
            <span className="wa-label">{STRINGS.accountEmailLabel}</span>
            <span className="wa-bk-acct-value">{account.loginEmail}</span>
          </div>
          <div className="wa-bk-acct-row">
            <span className="wa-label">{STRINGS.accountStatusLabel}</span>
            <span className={`wa-bk-status is-acct-${state.toLowerCase()}`}>
              {state === "verifying" ? STRINGS.statusVerifying : state === "valid" ? STRINGS.statusValid : STRINGS.statusNeedsAction}
            </span>
          </div>
          {account.classCode && (
            <div className="wa-bk-acct-row">
              <span className="wa-label">{STRINGS.accountClassLabel}</span>
              <span className="wa-bk-acct-value">{account.classCode}</span>
            </div>
          )}
          {formatVerifiedAt(account.verifiedAt) && (
            <div className="wa-bk-acct-row">
              <span className="wa-label">{STRINGS.accountVerifiedLabel}</span>
              <span className="wa-bk-acct-value">{formatVerifiedAt(account.verifiedAt)}</span>
            </div>
          )}
          {account.kind === "SHARED" && <div className="wa-hint">{STRINGS.accountSharedNote}</div>}
          {state === "verifying" && (
            <div className="wa-hint">{timedOut ? STRINGS.accountStillVerifying : STRINGS.accountVerifying}</div>
          )}
          {/* D-16：这处中文提示是锁定要求；BAD_CREDENTIALS 才有重新输入密码的表单 */}
          {state === "needsAction" && <div className="wa-bk-acct-note">{reasonHint(account.reason)}</div>}

          {showForm && (
            <CredentialForm
              key={account.loginEmail}
              lockedEmail={account.loginEmail}
              busy={busy}
              submitLabel={STRINGS.changePasswordSubmit}
              onSubmit={(e, p, w) => void link(e, p, w)}
            />
          )}

          <div className="wa-card-actions">
            <button className="wa-edit" disabled={busy || account.verifying} onClick={() => void reverify()}>
              {STRINGS.reverifyBtn}
            </button>
            {account.kind === "OWN" && !askedForPassword && (
              <button className="wa-edit" disabled={busy || account.verifying} onClick={() => setChanging((open) => !open)}>
                {changing ? STRINGS.closeFormBtn : STRINGS.changePasswordBtn}
              </button>
            )}
            <button className="wa-delete" disabled={busy || account.verifying} onClick={() => void unlink()}>
              {STRINGS.unlinkBtn}
            </button>
          </div>
          <div className="wa-hint">{STRINGS.accountSwitchNote}</div>
        </div>
      )}

      {message && <div className="wa-bk-acct-note" role="alert">{message}</div>}
    </section>
  );
}
