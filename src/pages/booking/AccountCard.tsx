// 「我的订场账号」卡片（D-13）：绑定 / 验证中 / Valid / Needs action。
// 密码只活在表单组件的 state 与一次提交的局部变量里：加密完就清空；不进 reducer、不进任何浏览器存储、
// 不拼进 URL、没有任何控制台输出（D-05、T-06-41）。后端永远只收到 {keyId, loginEmail, ciphertext}。
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getBookingKey, getMyBookingAccount, linkBookingAccount, type BookingAccountDto, type UserDto } from "../../api";
import { classifyError } from "../config/logic";
import { BookingKeyError, encryptCredentials } from "./accountCrypto";
import { POLL_INTERVAL_MS, POLL_MAX_MS, cardState, isVerifying, shouldKeepPolling } from "./accountCardLogic";
import { STRINGS } from "./strings";

type Props = {
  user: UserDto;
  account: BookingAccountDto | null | undefined; // undefined = 还没拿到
  loadFailed: boolean;
  onAccountChange: (account: BookingAccountDto | null) => void;
  onSignedOut: () => void;
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

export function AccountCard(props: Props) {
  const { account, user } = props;
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

  const state = cardState(account, user.admin);
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
            <span className={`wa-bk-status is-acct-${state}`}>
              {state === "verifying" ? STRINGS.statusVerifying : state === "valid" ? STRINGS.statusValid : STRINGS.statusNeedsAction}
            </span>
          </div>
          {state === "verifying" && (
            <div className="wa-hint">{timedOut ? STRINGS.accountStillVerifying : STRINGS.accountVerifying}</div>
          )}
        </div>
      )}

      {message && <div className="wa-bk-acct-note" role="alert">{message}</div>}
    </section>
  );
}
