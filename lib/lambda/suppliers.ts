import { createMasterHandler } from './common/masterHandler';
import { withJwtAuth } from './common/auth';
import { withErrorHandling } from './common/errorHandler';
import { supplierSchema } from './common/schemas';

export const handler = withErrorHandling(withJwtAuth(createMasterHandler('SUPPLIER_TABLE', 'm_supplier', supplierSchema)));
