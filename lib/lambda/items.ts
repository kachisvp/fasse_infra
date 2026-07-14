import { createMasterHandler } from './common/masterHandler';
import { withJwtAuth } from './common/auth';

export const handler = withJwtAuth(createMasterHandler('ITEM_TABLE', 'm_item'));
