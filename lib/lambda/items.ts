import { createMasterHandler } from './common/masterHandler';
import { withJwtAuth } from './common/auth';
import { withErrorHandling } from './common/errorHandler';
import { itemSchema } from './common/schemas';

export const handler = withErrorHandling(withJwtAuth(createMasterHandler('ITEM_TABLE', 'm_item', itemSchema)));
