import { useState } from "react";
import {
  setNotificationsEnabled, startNotifyEmailChange, verifyNotifyEmailChange, type UserDto,
} from "../../../api";
import { STRINGS } from "../strings";

interface Props {
  user: UserDto;
  onUserUpdated: (user: UserDto, message?: string) => void;
  onError: (error: unknown) => void;
}

// 账号面板，包括三项：
// - 登录邮箱。
// - 提醒的收件地址。修改地址前要先验证。
// - 提醒总开关。用户退订后，可以在这里重新打开。
export function AccountPanel({ user, onUserUpdated, onError }: Props) {
  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  const closeEditor = () => {
    setEditing(false);
    setCodeSent(false);
    setNewEmail("");
    setCode("");
  };

  const sendCode = () => run(async () => {
    await startNotifyEmailChange(newEmail.trim());
    setCodeSent(true);
  });

  const confirm = () => run(async () => {
    onUserUpdated(await verifyNotifyEmailChange(code.trim()), STRINGS.notifyEmailChanged);
    closeEditor();
  });

  const toggleAlerts = () => run(async () => {
    onUserUpdated(await setNotificationsEnabled(!user.notificationsEnabled));
  });

  return (
    <div className="wa-form wa-account">
      <div className="wa-form-title">{STRINGS.accountTitle}</div>

      <div className="wa-field">
        <div className="wa-label">{STRINGS.signedInAs}</div>
        <div className="wa-account-value">{user.loginEmail}</div>
      </div>

      <div className="wa-field">
        <div className="wa-label">{STRINGS.alertEmailLabel}</div>
        {!editing ? (
          <div className="wa-account-row">
            <span className="wa-account-value">{user.notifyEmail ?? STRINGS.notSet}</span>
            <button type="button" className="wa-linkbtn" onClick={() => setEditing(true)}>{STRINGS.changeEmail}</button>
          </div>
        ) : !codeSent ? (
          <form className="wa-field" onSubmit={(event) => { event.preventDefault(); void sendCode(); }}>
            <div className="wa-hint">{STRINGS.changeEmailHint}</div>
            <input
              type="email"
              className="wa-email"
              placeholder={STRINGS.emailPlaceholder}
              required
              autoFocus
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
            />
            <div className="wa-actions">
              <button type="submit" className="wa-submit" disabled={busy}>{STRINGS.sendCode}</button>
              <button type="button" className="wa-cancel" onClick={closeEditor}>{STRINGS.cancel}</button>
            </div>
          </form>
        ) : (
          <form className="wa-field" onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
            <div className="wa-hint">{STRINGS.codeSent(newEmail.trim())}</div>
            <input
              className="wa-email wa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              placeholder={STRINGS.codeLabel}
              aria-label={STRINGS.codeLabel}
              required
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            />
            <div className="wa-actions">
              <button type="submit" className="wa-submit" disabled={busy}>{STRINGS.confirmEmail}</button>
              <button type="button" className="wa-cancel" onClick={closeEditor}>{STRINGS.cancel}</button>
            </div>
          </form>
        )}
      </div>

      <div className={`wa-account-row wa-alerts${user.notificationsEnabled ? "" : " is-off"}`}>
        <span>{user.notificationsEnabled ? STRINGS.alertsOn : STRINGS.alertsOff}</span>
        <button type="button" className="wa-linkbtn" disabled={busy} onClick={() => void toggleAlerts()}>
          {user.notificationsEnabled ? STRINGS.turnOff : STRINGS.turnOn}
        </button>
      </div>
    </div>
  );
}
