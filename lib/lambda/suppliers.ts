import { createMasterHandler } from './common/masterHandler';
import { withJwtAuth } from './common/auth';

export const handler = withJwtAuth(createMasterHandler('SUPPLIER_TABLE', 'm_supplier'));
