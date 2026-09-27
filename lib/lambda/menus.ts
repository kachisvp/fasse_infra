import { createMasterHandler } from './common/masterHandler';
import { withJwtAuth } from './common/auth';
import { withErrorHandling } from './common/errorHandler';
import { menuSchema } from './common/schemas';

export const handler = withErrorHandling(withJwtAuth(createMasterHandler('MENU_TABLE', 'm_menu', menuSchema)));
