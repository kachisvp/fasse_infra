import { Logger } from '@aws-lambda-powertools/logger';

// 全Lambda共通の構造化ロガー。ログレベルは環境変数POWERTOOLS_LOG_LEVELで制御する(既定INFO)
// (docs/specs/purchase-sales design.md「入力検証・エラー応答」)
export const logger = new Logger({ serviceName: 'fasse-api' });
