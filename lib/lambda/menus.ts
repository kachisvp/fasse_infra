import { createMasterHandler } from './common/masterHandler';
import { withJwtAuth } from './common/auth';

export const handler = withJwtAuth(createMasterHandler('MENU_TABLE', 'm_menu'));
