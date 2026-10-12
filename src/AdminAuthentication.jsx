import { useCallback, useEffect, useState } from 'react';
import { ApiError, bookingApi } from './bookingApi';
import { ADMIN_PASSWORD_MIN_LENGTH, ADMIN_PASSWORD_MAX_LENGTH, ADMIN_SETUP_TOKEN_MIN_LENGTH } from './adminPolicy';

function NewPasswordFields({ prefix, password, confirmation, setPassword, setConfirmation }) {
  return <>
    <p id={`${prefix}-requirements`}>비밀번호는 {ADMIN_PASSWORD_MIN_LENGTH}–{ADMIN_PASSWORD_MAX_LENGTH}자로 설정하고, 다른 서비스와 다른 비밀번호를 사용해 주세요.</p>
    <label className="field" htmlFor={`${prefix}-password`}>새 관리자 비밀번호
      <input id={`${prefix}-password`} type="password" autoComplete="new-password" required
        minLength={ADMIN_PASSWORD_MIN_LENGTH} maxLength={ADMIN_PASSWORD_MAX_LENGTH}
        aria-describedby={`${prefix}-requirements`} value={password} onChange={(event) => setPassword(event.target.value)} />
    </label>
    <label className="field" htmlFor={`${prefix}-confirmation`}>비밀번호 확인
      <input id={`${prefix}-confirmation`} type="password" autoComplete="new-password" required
        minLength={ADMIN_PASSWORD_MIN_LENGTH} maxLength={ADMIN_PASSWORD_MAX_LENGTH}
        value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
    </label>
  </>;
}

export default function AdminAccess({ onAuthenticated, onBack, initialError }) {
  const [status, setStatus] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const report = useCallback((failure) => {
    console.error('Administrator access failed:', failure);
    setError(failure.message);
  }, []);
  const loadStatus = useCallback(async () => {
    setBusy(true);
    setError('');
    try { setStatus(await bookingApi('/admin/status')); }
    catch (failure) { report(failure); }
    finally { setBusy(false); }
  }, [report]);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const setup = status && !status.configured;
  const submit = async (event) => {
    event.preventDefault();
    if (setup && password !== confirmation) {
      setError('비밀번호와 확인 입력이 일치하지 않습니다.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await bookingApi(setup ? '/admin/setup' : '/admin/login', {
        method: 'POST', body: setup ? { password, setupToken } : { password },
      });
      setPassword('');
      setConfirmation('');
      setSetupToken('');
      await onAuthenticated();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) await loadStatus();
      report(failure);
    } finally { setBusy(false); }
  };
  return (
    <main className="admin-main">
      <button className="admin-back" onClick={onBack}>상담 신청 화면으로</button>
      <form className="admin-login form-card" onSubmit={submit}>
        <span className="eyebrow">보호된 관리자 화면</span>
        <h1>{setup ? '첫 관리자 설정' : '상담 운영자 로그인'}</h1>
        {!status ? <>
          {error ? <button type="button" disabled={busy} onClick={loadStatus}>다시 연결</button> : <p role="status">관리자 설정을 확인하고 있습니다.</p>}
        </> : setup ? <>
          <p>아직 관리자가 없습니다. 최초 설정을 완료한 사용자가 상담 운영자가 됩니다. 일반 방문자나 상담 신청자는 관리자로 등록되지 않습니다.</p>
          {status.setupAllowed ? <>
            {status.requiresSetupToken && <label className="field" htmlFor="admin-setup-token">초기 설정 승인 코드
              <input id="admin-setup-token" type="password" autoComplete="off" required
                minLength={ADMIN_SETUP_TOKEN_MIN_LENGTH} maxLength={ADMIN_PASSWORD_MAX_LENGTH}
                value={setupToken} onChange={(event) => setSetupToken(event.target.value)} />
            </label>}
            <NewPasswordFields prefix="admin-setup" password={password} confirmation={confirmation} setPassword={setPassword} setConfirmation={setConfirmation} />
          </> : <p role="status">공개 사이트의 초기 설정은 잠겨 있습니다. 서버 운영자가 ADMIN_SETUP_TOKEN을 설정하거나 로컬 서버에서 초기 설정을 완료해야 합니다.</p>}
        </> : <>
          <p>학생 정보·예약·결제 상태는 로그인한 운영자만 확인할 수 있습니다.</p>
          <label className="field" htmlFor="admin-password">관리자 비밀번호
            <input id="admin-password" type="password" autoComplete="current-password" required
              maxLength={ADMIN_PASSWORD_MAX_LENGTH} value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
        </>}
        {(error || initialError) && <p className="booking-error" role="alert">{error || initialError}</p>}
        {status && (!setup || status.setupAllowed) && <button className="primary-button" disabled={busy}>
          {busy ? '확인 중' : setup ? '첫 관리자 등록' : '로그인'}
        </button>}
      </form>
    </main>
  );
}

export function AdminPasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  return (
    <details className="admin-password-settings">
      <summary>관리자 비밀번호 변경</summary>
      <form className="admin-login form-card" onSubmit={async (event) => {
        event.preventDefault();
        setError('');
        setNotice('');
        if (password !== confirmation) {
          setError('비밀번호와 확인 입력이 일치하지 않습니다.');
          return;
        }
        setBusy(true);
        try {
          await bookingApi('/admin/password', { method: 'POST', body: { currentPassword, password } });
          setCurrentPassword('');
          setPassword('');
          setConfirmation('');
          setNotice('비밀번호를 변경했습니다. 다른 관리자 세션은 모두 로그아웃되었습니다.');
        } catch (failure) {
          console.error('Administrator password change failed:', failure);
          setError(failure.message);
        } finally { setBusy(false); }
      }}>
        <h2>관리자 비밀번호 변경</h2>
        <label className="field" htmlFor="admin-current-password">현재 관리자 비밀번호
          <input id="admin-current-password" type="password" autoComplete="current-password" required
            maxLength={ADMIN_PASSWORD_MAX_LENGTH} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        </label>
        <NewPasswordFields prefix="admin-change" password={password} confirmation={confirmation} setPassword={setPassword} setConfirmation={setConfirmation} />
        {error && <p className="booking-error" role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <button className="primary-button" disabled={busy}>{busy ? '변경 중' : '비밀번호 변경'}</button>
      </form>
    </details>
  );
}
