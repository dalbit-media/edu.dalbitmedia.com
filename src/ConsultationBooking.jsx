import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { ApiError, bookingApi } from './bookingApi';
import { PAID_SERVICE, HOLD_MINUTES, appointmentLabel, koreanDate, koreanTime, monthDays, shiftMonth } from './booking';

export function BookingCalendar({ slots, selected, onSelect, month, setMonth }) {
  const dates = new Set(slots.map((slot) => koreanDate(slot.startsAt)));
  return (
    <div className="booking-calendar">
      <div className="calendar-heading">
        <button type="button" aria-label="이전 달" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={18} /></button>
        <strong>{month.slice(0, 4)}년 {Number(month.slice(5))}월</strong>
        <button type="button" aria-label="다음 달" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={18} /></button>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">{['일', '월', '화', '수', '목', '금', '토'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-days" aria-label="상담 날짜 · 한국시간">
        {monthDays(month).map((day, index) => day ? (
          <button type="button" key={day} disabled={!dates.has(day)} aria-pressed={selected === day}
            aria-label={`${day}${dates.has(day) ? ' 예약 가능' : ' 예약 가능한 시간 없음'}`}
            onClick={() => onSelect(day)}>{Number(day.slice(-2))}{dates.has(day) && <i aria-hidden="true" />}</button>
        ) : <span key={`blank-${index}`} />)}
      </div>
    </div>
  );
}

export function ConsultationChoice({ service, onService, slotId, onSlot, consent, onConsent, onReady }) {
  const [config, setConfig] = useState(null);
  const [slots, setSlots] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => koreanDate(Date.now()).slice(0, 7));
  const [date, setDate] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [configuration, available] = await Promise.all([bookingApi('/config'), bookingApi('/slots')]);
      if (configuration.service.amount !== PAID_SERVICE.amount) throw new ApiError('상담 금액이 변경되었습니다. 페이지를 새로고침한 뒤 금액을 확인해 주세요.');
      setConfig(configuration);
      setSlots(available.slots);
      onReady(configuration.paymentReady);
      if (slotId && !available.slots.some((slot) => slot.id === slotId)) onSlot('');
      if (available.slots.length && (!date || !available.slots.some((slot) => koreanDate(slot.startsAt) === date))) {
        const nextDate = koreanDate(available.slots[0].startsAt);
        setDate(nextDate);
        setMonth(nextDate.slice(0, 7));
      } else if (!available.slots.length) {
        setDate('');
      }
    } catch (failure) {
      console.error('Consultation availability could not be loaded:', failure);
      setError(failure.message);
      onReady(false);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  const amount = config?.service.amount ?? PAID_SERVICE.amount;
  return (
    <section className="consultation-choice" aria-label="상담 방식 선택">
      <div className="service-choices">
        <button type="button" aria-pressed={service === 'free'} onClick={() => onService('free')}>
          <strong>무료 기본 상담</strong><span>최대 15분</span><small>신청 후 담당자 일정에 맞춰 연락</small>
        </button>
        <button type="button" aria-pressed={service === 'paid'} onClick={() => onService('paid')}>
          <strong>전문가 심층 상담</strong><span>{PAID_SERVICE.description} · {amount.toLocaleString('ko-KR')}원</span><small>{PAID_SERVICE.priceNote} · 시간 선택 · 토스페이먼츠 결제</small>
        </button>
      </div>
      {service === 'free' ? (
        <p className="service-explanation">정보를 제출하면 담당자가 가능한 시간을 확인한 뒤 선택하신 연락 방법으로 최대 15분의 무료 기본 상담을 안내합니다. 즉시 예약은 아닙니다.</p>
      ) : (
        <div className="paid-calendar-panel">
          <h3><CalendarDays size={18} /> 전문가 심층 상담 시간 선택</h3>
          <button type="button" className="availability-refresh" disabled={loading} onClick={load}>가능한 시간 새로고침</button>
          <p className="service-explanation">전문가 심층 상담은 최대 60분이며 달력에는 1시간을 확보합니다. 모든 일정은 한국시간(UTC+9)입니다. 시작 15분 전까지만 예약할 수 있으며 결제 확인 후 예약이 확정됩니다.</p>
          {loading && <p role="status">가능한 시간을 불러오는 중입니다.</p>}
          {error && <div className="booking-error" role="alert">{error} <button type="button" onClick={load}>다시 불러오기</button></div>}
          {!loading && !error && !config?.paymentReady && <p className="booking-notice">결제 설정이 아직 완료되지 않아 유료 예약은 열리지 않았습니다. 무료 기본 상담 신청은 이용할 수 있습니다.</p>}
          {config?.paymentMode === 'test' && <p className="booking-notice">토스페이먼츠 테스트 모드입니다. 실제 결제가 발생하지 않습니다.</p>}
          {!loading && !error && (
            <>
              <BookingCalendar slots={slots} selected={date} onSelect={(day) => { setDate(day); onSlot(''); }} month={month} setMonth={(next) => { setMonth(next); setDate(''); onSlot(''); }} />
              {!slots.length && <p className="booking-notice">아직 공개된 시간이 없습니다. 무료 기본 상담 신청으로 연락 정보를 남겨 주세요.</p>}
              <div className="booking-times" role="group" aria-label="상담 시작 시간">
                {slots.filter((slot) => koreanDate(slot.startsAt) === date).map((slot) => <button key={slot.id} type="button" aria-pressed={slotId === slot.id} onClick={() => onSlot(slot.id)}>{koreanTime(slot.startsAt)}</button>)}
              </div>
              {slotId && slots.some((slot) => slot.id === slotId) && <p className="booking-selected">{appointmentLabel(slots.find((slot) => slot.id === slotId).startsAt)}</p>}
            </>
          )}
          <p className="service-explanation">결제를 시작하면 해당 시간은 {HOLD_MINUTES}분간 임시 확보됩니다. 상담 시작 전 취소 요청은 전액 환불하며, 환불 반영 시점은 결제수단에 따라 다릅니다. 시작 이후에는 운영자에게 문의해 주세요.</p>
          <label className="booking-consent"><input type="checkbox" checked={consent} onChange={(event) => onConsent(event.target.checked)} /> <span>상담 시간·금액 및 취소·환불 안내를 확인했습니다.</span></label>
          {config?.supportEmail && <p className="service-explanation">예약·환불 문의: <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a></p>}
        </div>
      )}
    </section>
  );
}

export function PaymentReturn({ failed }) {
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const orderId = params.get('orderId');
  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      if (failed) {
        const pending = orderId || sessionStorage.getItem('dalbit-payment-order');
        if (pending) await bookingApi(`/bookings/${encodeURIComponent(pending)}/release`, { method: 'POST', body: {} });
        setError('결제가 완료되지 않았습니다. 예약 화면에서 다시 신청해 주세요.');
      } else {
        if (!orderId || !params.get('paymentKey') || !params.get('amount')) throw new ApiError('결제 결과에 필요한 정보가 없습니다.');
        const result = await bookingApi(`/bookings/${encodeURIComponent(orderId)}/confirm`, {
          method: 'POST', body: { paymentKey: params.get('paymentKey'), amount: Number(params.get('amount')) },
        });
        if (!['paid', 'cancelled'].includes(result.status)) throw new ApiError('예약이 확정되지 않았습니다. 운영자에게 결제 상태 확인을 요청해 주세요.');
        setBooking(result);
        try { sessionStorage.removeItem('dalbit-payment-order'); }
        catch (failure) { console.error('Payment session storage cleanup failed:', failure); setError('결제 상태는 확인되었으나 브라우저의 임시 결제 정보를 지우지 못했습니다.'); }
      }
    } catch (failure) {
      console.error('Payment return could not be completed:', failure);
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { if (!started.current) { started.current = true; confirm(); } }, []);
  const cancel = async () => {
    if (!window.confirm('이 예약을 취소하고 전액 환불을 요청하시겠습니까?')) return;
    setBusy(true);
    setError('');
    try {
      setBooking(await bookingApi(`/bookings/${encodeURIComponent(booking.id)}/cancel`, { method: 'POST', body: {} }));
    } catch (failure) {
      console.error('Booking refund failed:', failure);
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="payment-result form-card intake-card">
      <h1>{booking?.status === 'cancelled' ? '예약 취소·전액 환불 확인' : booking ? '결제 완료 · 상담 예약 확정' : failed ? '결제 미완료' : '결제 상태 확인'}</h1>
      {busy && <p role="status">서버에서 결제 상태를 확인하고 있습니다.</p>}
      {booking && <div className="summary-ticket"><strong>{appointmentLabel(booking.startsAt)}</strong><p>전문가 심층 상담 · {PAID_SERVICE.description} · {booking.amount.toLocaleString('ko-KR')}원 ({PAID_SERVICE.priceNote})</p><small>예약번호: {booking.id}</small><p>상담 접속 방법은 담당자가 별도로 안내합니다.</p></div>}
      {error && <p className="booking-error" role="alert">{error}</p>}
      {!booking && !busy && !failed && <button type="button" className="primary-button" onClick={confirm}>결제 상태 다시 확인</button>}
      {booking?.receiptUrl && <a href={booking.receiptUrl} target="_blank" rel="noopener noreferrer">결제 영수증 보기</a>}
      {booking?.status === 'paid' && <button type="button" disabled={busy} onClick={cancel}>예약 취소·전액 환불 요청</button>}
      <a href="/#consultation">상담 화면으로 돌아가기</a>
    </main>
  );
}
