import { createHeaderDetailHandler } from './common/headerDetailHandler';
import { withJwtAuth } from './common/auth';

export const handler = withJwtAuth(
  createHeaderDetailHandler({
    headerTableEnvVar: 'PURCHASE_HEADER_TABLE',
    detailTableEnvVar: 'PURCHASE_DETAIL_TABLE',
    gsiName: 'gsi_purchase_date',
    gsiPk: 'PURCHASE_HEADER',
    dateField: 'purchase_date',
    detailForeignKey: 'purchase_id',
    noField: 'purchase_no',
    noPrefix: 'PO',
  }),
);
