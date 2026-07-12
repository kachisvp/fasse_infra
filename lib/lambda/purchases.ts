import { createHeaderDetailHandler } from './common/headerDetailHandler';

export const handler = createHeaderDetailHandler({
  headerTableEnvVar: 'PURCHASE_HEADER_TABLE',
  detailTableEnvVar: 'PURCHASE_DETAIL_TABLE',
  gsiName: 'gsi_purchase_date',
  gsiPk: 'PURCHASE_HEADER',
  dateField: 'purchase_date',
  detailForeignKey: 'purchase_id',
  noField: 'purchase_no',
  noPrefix: 'PO',
});
