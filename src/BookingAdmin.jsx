import { useEffect, useState } from 'react';
import { CalendarDays, LogOut, RefreshCw } from 'lucide-react';
import { ApiError, bookingApi } from './bookingApi';
import { appointmentLabel, koreanDate, koreanTime, monthDays, shiftMonth } from './booking';
import AdminAccess, { AdminPasswordForm } from './AdminAuthentication';

const statusLabels = {
  pending: '결제 대기', confirming: '결제 확인 필요', paid: '결제 완료', cancelling: '환불 확인 필요',
  cancelled: '취소', expired: '만료', free_scheduled: '무료 기본 상담 예정', free_completed: '무료 기본 상담 완료',
};
const active = ['pending', 'confirming', 'paid', 'cancelling', 'free_scheduled'];

export default function BookingAdmin({ onBack }) {
  const [board, setBoard] = useState(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(() => koreanDate(Date.now()).slice(0, 7));
  const [day, setDay] = useState(() => koreanDate(Date.now()));
  const [time, setTime] = useState('14:00');
  const [search, setSearch] = useState('');
  const [callbackSlots, setCallbackSlots] = useState({});
  const report = (failure) => {
    if (failure instanceof ApiError && failure.status === 401) {
      setNeedsLogin(true);
      setBoard(null);
      setError('');
      return;
    }
    console.error('Admin booking operation failed:', failure);
    setError(failure.message);
  };
  const load = async () => {
    try {
      setBoard(await bookingApi('/admin/board'));
      setNeedsLogin(false);
    } catch (failure) { report(failure); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!board) return;
    const timer = setInterval(() => { load(); }, 60000);
    return () => clearInterval(timer);
  }, [Boolean(board)]);
  const run = async (action) => {
    setBusy(true);
    setError('');
    try { await action(); await load(); }
    catch (failure) { report(failure); if (board) await load(); }
    finally { setBusy(false); }
  };
  if (needsLogin) return <AdminAccess onBack={onBack} initialError={error} onAuthenticated={async () => { setError(''); await load(); }} />;
  if (!board) return <main className="admin-main"><button className="admin-back" onClick={onBack}>상담 신청 화면으로</button><h1>상담 예약 관리</h1>{error ? <><p className="booking-error" role="alert">{error}</p><button onClick={load}>다시 연결</button></> : <p role="status">관리자 정보를 확인하고 있습니다.</p>}</main>;
  const reserved = new Map(board.bookings.filter((booking) => active.includes(booking.status)).map((booking) => [booking.slotId, booking]));
  const openSlots = board.slots.filter((slot) => slot.open && !reserved.has(slot.id) && Date.parse(slot.startsAt) > Date.now());
  const daySlots = board.slots.filter((slot) => koreanDate(slot.startsAt) === day);
  const requests = board.requests.filter((request) => `${request.name} ${request.school} ${request.schoolType} ${request.guardian}`.includes(search));
  return (
    <main className="admin-main booking-admin">
      <button className="admin-back" onClick={onBack}>상담 신청 화면으로</button>
      <header className="admin-header"><div><p>상담 운영 현황 · 한국시간 UTC+9</p><h1>예약 달력·상담 신청 관리</h1></div>
        <div className="booking-admin-actions">
          <button disabled={busy} onClick={() => run(async () => {})}><RefreshCw size={16} /> 새로고침</button>
          <button disabled={busy} onClick={() => run(async () => { await bookingApi('/admin/logout', { method: 'POST', body: {} }); setBoard(null); setNeedsLogin(true); })}><LogOut size={16} /> 로그아웃</button>
        </div>
      </header>
      {error && <p className="booking-error" role="alert">{error}</p>}
      <AdminPasswordForm />
      <div className="booking-metrics"><span>무료 신규 신청 <b>{board.requests.filter((request) => request.status === '신규').length}</b></span><span>유료 확정 예약 <b>{board.bookings.filter((booking) => booking.status === 'paid').length}</b></span><span>공개된 빈 시간 <b>{openSlots.length}</b></span></div>
      <section className="admin-calendar-card" id="admin-calendar">
        <div>
          <div className="calendar-heading"><button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="관리 달력 이전 달">‹</button><h2>{month.slice(0, 4)}년 {Number(month.slice(5))}월</h2><button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="관리 달력 다음 달">›</button></div>
          <div className="calendar-weekdays" aria-hidden="true">{['일', '월', '화', '수', '목', '금', '토'].map((date) => <span key={date}>{date}</span>)}</div>
          <div className="calendar-days admin-days">{monthDays(month).map((date, index) => date ? <button key={date} aria-label={`${date} 관리`} aria-pressed={date === day} onClick={() => setDay(date)}>{Number(date.slice(-2))}{board.slots.some((slot) => koreanDate(slot.startsAt) === date) && <i aria-hidden="true" />}</button> : <span key={`empty-${index}`} />)}</div>
        </div>
        <div className="admin-day-agenda">
          <h2><CalendarDays size={18} /> {day} 일정</h2>
          <p>전문가 심층 상담은 최대 60분, 무료 기본 상담은 최대 15분입니다. 무료 일정도 일정 관리를 위해 한 시간 블록을 확보하여 겹침을 방지합니다.</p>
          <form className="slot-create" onSubmit={(event) => { event.preventDefault(); run(() => bookingApi('/admin/slots', { method: 'POST', body: { startsAt: `${day}T${time}:00+09:00` } })); }}>
            <label htmlFor="slot-date">날짜<input id="slot-date" type="date" required value={day} onChange={(event) => { setDay(event.target.value); setMonth(event.target.value.slice(0, 7)); }} /></label>
            <label htmlFor="slot-time">시작 시간<input id="slot-time" type="time" required value={time} onChange={(event) => setTime(event.target.value)} /></label>
            <button className="primary-button" disabled={busy}>1시간 공개</button>
          </form>
          {!daySlots.length && <p>이 날짜에 공개된 시간이 없습니다.</p>}
          {daySlots.map((slot) => {
            const booking = reserved.get(slot.id);
            return <div className="agenda-slot" key={slot.id}>
              <strong>{koreanTime(slot.startsAt)}–{koreanTime(slot.endsAt)}</strong>
              <span>{booking ? `${statusLabels[booking.status]} · ${booking.intake.name}` : slot.open ? '예약 가능' : '비공개'}</span>
              {!booking && <button disabled={busy || Date.parse(slot.startsAt) <= Date.now()} onClick={() => run(() => bookingApi(`/admin/slots/${slot.id}`, { method: 'PATCH', body: { open: !slot.open } }))}>{slot.open ? '닫기' : '다시 열기'}</button>}
            </div>;
          })}
        </div>
      </section>
      <section className="admin-records">
        <h2>유료 예약 및 무료 확정 일정</h2>
        {!board.bookings.length && <p>아직 예약이 없습니다.</p>}
        {board.bookings.filter((booking) => active.includes(booking.status)).map((booking) => (
          <article className="booking-record" key={booking.id}>
            <div><strong>{booking.intake.name} · {booking.intake.grade}</strong><p>{appointmentLabel(booking.startsAt)} · {statusLabels[booking.status]}{booking.amount > 0 && ` · ${booking.amount.toLocaleString('ko-KR')}원`}</p><small>{booking.id}</small>
              <p>{booking.intake.guardian} ({booking.intake.contactRole}) · {booking.intake.contact} · {booking.intake.phone || booking.intake.email}</p></div>
            <div className="record-actions">
              {booking.intake.phone && <a href={`tel:${booking.intake.phone}`}>전화 연결</a>}
              {booking.intake.email && <a href={`mailto:${booking.intake.email}`}>이메일 작성</a>}
              {['confirming', 'cancelling'].includes(booking.status) && <button disabled={busy} onClick={() => run(() => bookingApi(`/admin/bookings/${booking.id}/reconcile`, { method: 'POST', body: {} }))}>결제사 상태 확인</button>}
              {['paid', 'cancelling', 'free_scheduled'].includes(booking.status) && <button disabled={busy} onClick={() => {
                if (window.confirm(booking.amount ? '예약을 취소하고 전액 환불하시겠습니까?' : '무료 상담 일정을 취소하시겠습니까?')) run(() => bookingApi(`/admin/bookings/${booking.id}/cancel`, { method: 'POST', body: {} }));
              }}>{booking.amount ? '취소·전액 환불' : '무료 일정 취소'}</button>}
              {booking.receiptUrl && <a href={booking.receiptUrl} target="_blank" rel="noopener noreferrer">영수증</a>}
            </div>
            <details><summary>학생·상담 정보</summary><IntakeDetails intake={booking.intake} /></details>
          </article>
        ))}
        <details className="booking-history"><summary>취소·만료·종료 기록 ({board.bookings.filter((booking) => !active.includes(booking.status)).length})</summary>
          {board.bookings.filter((booking) => !active.includes(booking.status)).map((booking) => <p key={booking.id}>{booking.intake.name} · {appointmentLabel(booking.startsAt)} · {statusLabels[booking.status]}</p>)}
        </details>
      </section>
      <section className="admin-records">
        <h2 id="admin-requests">무료 기본 상담 요청 · 최대 15분</h2>
        <p>신청은 즉시 예약이 아닙니다. 연락 가능한 시간을 확인하여 신청자에게 안내한 뒤 일정을 지정해 주세요.</p>
        <label className="field" htmlFor="request-search">이름·학교·교육 경로 검색<input id="request-search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        {!requests.length && <p>표시할 무료 기본 상담 요청이 없습니다.</p>}
        {requests.map((request) => (
          <article key={request.id} className="booking-record free-request">
            <strong>{request.name} · {request.grade}</strong><span>{request.status} · {appointmentLabel(request.createdAt)}</span>
            <IntakeDetails intake={request} />
            <div className="record-actions">
              {request.phone && <a href={`tel:${request.phone}`}>전화 연결</a>}
              {request.email && <a href={`mailto:${request.email}`}>이메일 작성</a>}
              <label>처리 상태<select aria-label={`${request.name} 처리 상태`} value={request.status} disabled={busy} onChange={(event) => run(() => bookingApi(`/admin/requests/${request.id}`, { method: 'PATCH', body: { status: event.target.value } }))}>
                {['신규', '연락 완료', '상담 예정', '상담 완료'].map((status) => <option value={status} disabled={status === '상담 예정'} key={status}>{status}</option>)}
              </select></label>
            </div>
            {request.status !== '상담 완료' && !board.bookings.some((booking) => booking.requestId === request.id && booking.status === 'free_scheduled') && (
              <form className="callback-schedule" onSubmit={(event) => { event.preventDefault(); run(() => bookingApi(`/admin/requests/${request.id}/schedule`, { method: 'POST', body: { slotId: callbackSlots[request.id] } })); }}>
                <label htmlFor={`callback-${request.id}`}>안내 후 무료 기본 상담 일정 지정<select id={`callback-${request.id}`} required value={callbackSlots[request.id] || ''} onChange={(event) => setCallbackSlots((current) => ({ ...current, [request.id]: event.target.value }))}>
                  <option value="">공개된 빈 시간 선택</option>{openSlots.map((slot) => <option value={slot.id} key={slot.id}>{appointmentLabel(slot.startsAt)}</option>)}
                </select></label><button disabled={busy} className="primary-button">무료 일정 지정</button>
              </form>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}

function IntakeDetails({ intake }) {
  return <dl className="intake-record-details">
    <div><dt>연락받을 분</dt><dd>{intake.guardian} · {intake.contactRole} · {intake.contact}</dd></div>
    <div><dt>연락처</dt><dd>{intake.phone || '전화번호 미입력'}{intake.email && ` · ${intake.email}`}</dd></div>
    <div><dt>교육 경로</dt><dd>{intake.schoolType || '미입력'} · {intake.schoolStage || '미입력'}</dd></div>
    <div><dt>학교·지역</dt><dd>{intake.school || '미입력'} · {intake.region || '미입력'}</dd></div>
    <div><dt>상담 주제</dt><dd>{intake.subjects?.join(', ') || '상담 시 확인'}</dd></div>
    <div><dt>추가 내용</dt><dd>{intake.goals || '미입력'}</dd></div>
    <div><dt>희망 일정</dt><dd>{intake.preferred}</dd></div>
  </dl>;
}
