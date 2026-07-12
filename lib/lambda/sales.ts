import { createHeaderDetailHandler } from './common/headerDetailHandler';

export const handler = createHeaderDetailHandler({
  headerTableEnvVar: 'SALES_HEADER_TABLE',
  detailTableEnvVar: 'SALES_DETAIL_TABLE',
  gsiName: 'gsi_business_date',
  gsiPk: 'SALES_HEADER',
  dateField: 'business_date',
  detailForeignKey: 'sales_id',
  noField: 'sales_no',
  noPrefix: 'SO',
});
