export class ApiError extends Error {
  constructor(message, status = 0, holdReleased = false) {
    super(message);
    this.status = status;
    this.holdReleased = holdReleased;
  }
}

export async function bookingApi(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    console.error('Booking API connection failed:', error);
    throw new ApiError('서버에 연결하지 못했습니다. 입력 내용은 유지됩니다. 연결 상태를 확인하고 다시 시도해 주세요.');
  }
  let data;
  try {
    data = await response.json();
  } catch (error) {
    console.error('Booking API returned invalid JSON:', error);
    throw new ApiError('예약 서버의 응답을 읽을 수 없습니다. 서버 실행 상태를 확인해 주세요.', response.status);
  }
  if (!response.ok) throw new ApiError(data.message || '요청을 처리하지 못했습니다. 다시 시도해 주세요.', response.status);
  return data;
}

let sdkPromise;
export function loadTossSdk() {
  if (typeof window.TossPayments === 'function') return Promise.resolve(window.TossPayments);
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://js.tosspayments.com/v2/standard';
      script.async = true;
      script.onload = () => {
        if (typeof window.TossPayments === 'function') resolve(window.TossPayments);
        else reject(new ApiError('토스페이먼츠 결제 모듈을 초기화하지 못했습니다.'));
      };
      script.onerror = () => {
        script.remove();
        reject(new ApiError('토스페이먼츠 결제 모듈을 불러오지 못했습니다. 연결 상태를 확인해 주세요.'));
      };
      document.head.append(script);
    }).catch((error) => {
      sdkPromise = undefined;
      throw error;
    });
  }
  return sdkPromise;
}

export async function startPaidBooking(intake, slotId, nonce) {
  const TossPayments = await loadTossSdk();
  const order = await bookingApi('/bookings', { method: 'POST', body: { intake, slotId, nonce, consent: true, expectedAmount: PAID_SERVICE.amount } });
  try {
    sessionStorage.setItem('dalbit-payment-order', order.orderId);
    await TossPayments(order.clientKey).payment({ customerKey: order.customerKey }).requestPayment({
      method: 'CARD', amount: { currency: order.currency, value: order.amount },
      orderId: order.orderId, orderName: order.orderName,
      successUrl: order.successUrl, failUrl: order.failUrl,
    });
  } catch (error) {
    console.error('Toss checkout did not complete:', error);
    try {
      await bookingApi(`/bookings/${order.orderId}/release`, { method: 'POST', body: {} });
    } catch (releaseError) {
      console.error('Booking hold release failed:', releaseError);
      throw new ApiError('결제 진행 상태를 확인하지 못했습니다. 예약 시간이 보호되고 있으므로 운영자에게 문의해 주세요.');
    }
    throw new ApiError(error.code === 'USER_CANCEL' || error.code === 'PAY_PROCESS_CANCELED'
      ? '결제를 취소했습니다. 다른 시간을 선택하거나 다시 결제를 시작할 수 있습니다.'
      : '결제를 시작하지 못했습니다. 예약 시간은 해제되었습니다. 다시 시도해 주세요.', 0, true);
  }
}
import { PAID_SERVICE } from './booking.js';
