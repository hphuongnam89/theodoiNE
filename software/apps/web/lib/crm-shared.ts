export type LeadStage = 'NEW' | 'CONTACTED' | 'CONSULTING' | 'WAITING_DOCUMENTS' | 'WAITING_PAYMENT' | 'LOST';

export const STAGE_LABELS: Record<LeadStage, string> = {
  NEW: 'Mới', CONTACTED: 'Đã liên hệ', CONSULTING: 'Đang tư vấn',
  WAITING_DOCUMENTS: 'Chờ hồ sơ', WAITING_PAYMENT: 'Chờ học phí', LOST: 'Không tiếp tục',
};
