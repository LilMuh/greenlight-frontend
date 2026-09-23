import { useState } from "react";
import { loginWithGoogle, startEmailLogin, verifyEmailLogin, type LoginResultDto } from "../../../api";
import { STRINGS } from "../strings";
import { GoogleButton, googleSignInEnabled } from "./GoogleButton";

interface Props {
  onSignedIn: (result: LoginResultDto) => void;
  onError: (error: unknown) => void;
}

// 未登录时的整块：Google 按钮，或者「填邮箱 → 收码 → 填码」两步。
export function LoginPanel({ onSignedIn, onError }: Props) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 同一时间只跑一个请求，防止连点重复发码
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

  const sendCode = () => run(async () => {
    await startEmailLogin(email.trim());
    setCodeSentTo(email.trim());
    setCode("");
  });

  const verify = () => run(async () => {
    onSignedIn(await verifyEmailLogin(codeSentTo!, code.trim()));
  });

  const google = (idToken: string) => run(async () => {
    onSignedIn(await loginWithGoogle(idToken));
  });

  return (
    <div className="wa-form wa-login">
      <div className="wa-form-title">{STRINGS.signInTitle}</div>
      <div className="wa-hint">{googleSignInEnabled ? STRINGS.signInHint : STRINGS.signInHintEmailOnly}</div>

      <GoogleButton onCredential={google} />
      {googleSignInEnabled && <div className="wa-divider">{STRINGS.orDivider}</div>}

      {codeSentTo == null ? (
        <form className="wa-field" onSubmit={(event) => { event.preventDefault(); void sendCode(); }}>
          <input
            type="email"
            className="wa-email"
            placeholder={STRINGS.emailPlaceholder}
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button type="submit" className="wa-submit" disabled={busy}>{STRINGS.sendCode}</button>
        </form>
      ) : (
        <form className="wa-field" onSubmit={(event) => { event.preventDefault(); void verify(); }}>
          <div className="wa-hint">{STRINGS.codeSent(codeSentTo)}</div>
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
          <button type="submit" className="wa-submit" disabled={busy}>{STRINGS.signIn}</button>
          <button type="button" className="wa-linkbtn" onClick={() => setCodeSentTo(null)}>
            {STRINGS.useOtherEmail}
          </button>
        </form>
      )}
    </div>
  );
}
