import { createTaxRatesHandler } from './common/taxRatesHandler';
import { withJwtAuth } from './common/auth';
import { withErrorHandling } from './common/errorHandler';

export const handler = withErrorHandling(withJwtAuth(createTaxRatesHandler()));
