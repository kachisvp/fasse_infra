import { createHeaderDetailHandler } from './common/headerDetailHandler';
import { withJwtAuth } from './common/auth';
import { withErrorHandling } from './common/errorHandler';
import { salesDetailSchema, salesHeaderSchema } from './common/schemas';

export const handler = withErrorHandling(
  withJwtAuth(
    createHeaderDetailHandler({
      headerTableEnvVar: 'SALES_HEADER_TABLE',
      detailTableEnvVar: 'SALES_DETAIL_TABLE',
      gsiName: 'gsi_business_date',
      gsiPk: 'SALES_HEADER',
      dateField: 'business_date',
      detailForeignKey: 'sales_id',
      noField: 'sales_no',
      noPrefix: 'SO',
      headerSchema: salesHeaderSchema,
      detailSchema: salesDetailSchema,
    }),
  ),
);
