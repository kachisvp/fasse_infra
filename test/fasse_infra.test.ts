import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { FasseInfraStack } from '../lib/fasse_infra-stack';

describe('FasseInfraStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new FasseInfraStack(app, 'TestStack', {
      env: { region: 'ap-northeast-1' },
      config: {
        envName: 'stg',
        region: 'ap-northeast-1',
        resourcePrefix: 'fasse-stg-test',
      },
    });
    template = Template.fromStack(stack);
  });

  test('DynamoDBテーブルが9個（counters, マスタ3, 消費税率マスタ1, 仕入2, 売上2）作成される', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 9);
  });

  test('countersテーブルがcounter_nameをPKに持つ', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'fasse-stg-test-counters',
      KeySchema: [{ AttributeName: 'counter_name', KeyType: 'HASH' }],
    });
  });

  test('m_tax_rateがtax_category(PK) + valid_from(SK)の複合キーを持つ', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'fasse-stg-test-m-tax-rate',
      KeySchema: [
        { AttributeName: 'tax_category', KeyType: 'HASH' },
        { AttributeName: 'valid_from', KeyType: 'RANGE' },
      ],
    });
  });

  test('t_purchase_headerにgsi_purchase_dateが定義される', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'fasse-stg-test-t-purchase-header',
      GlobalSecondaryIndexes: [{ IndexName: 'gsi_purchase_date' }],
    });
  });

  test('t_sales_headerにgsi_business_dateが定義される', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'fasse-stg-test-t-sales-header',
      GlobalSecondaryIndexes: [{ IndexName: 'gsi_business_date' }],
    });
  });

  test('Lambda関数が8個（items/suppliers/menus/tax-rates/purchases/sales/認証ルートA/ルートB）作成される', () => {
    template.resourceCountIs('AWS::Lambda::Function', 8);
  });

  test('APIGatewayのRestApiが1個作成される', () => {
    template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
  });

  test('JWT署名用のKMS非対称鍵が1個作成される', () => {
    template.hasResourceProperties('AWS::KMS::Key', {
      KeySpec: 'RSA_2048',
      KeyUsage: 'SIGN_VERIFY',
    });
  });

  test('stg環境ではWAF(WebACL)が作成され、APIGatewayステージに関連付けられる（NFR-004）', () => {
    template.resourceCountIs('AWS::WAFv2::WebACL', 1);
    template.resourceCountIs('AWS::WAFv2::WebACLAssociation', 1);
  });

  test('stg環境ではCognito User Poolが1個、セルフサインアップ無効で作成される（REQ-110）', () => {
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    });
  });

  test('Cognito App Clientがシークレットなし・Authorization Code Grant + PKCEで作成される（REQ-110）', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      AllowedOAuthFlows: ['code'],
      AllowedOAuthScopes: ['openid', 'email'],
    });
  });
});

describe('FasseInfraStack (dev環境)', () => {
  let devTemplate: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new FasseInfraStack(app, 'TestDevStack', {
      env: { region: 'ap-northeast-1' },
      config: {
        envName: 'dev',
        region: 'ap-northeast-1',
        resourcePrefix: 'fasse-dev-test',
      },
    });
    devTemplate = Template.fromStack(stack);
  });

  test('dev環境はcdk destroyでの破棄運用のためWAFを作成しない（REQ-109）', () => {
    devTemplate.resourceCountIs('AWS::WAFv2::WebACL', 0);
    devTemplate.resourceCountIs('AWS::WAFv2::WebACLAssociation', 0);
  });

  test('dev環境は専用のCognito User Poolを作成しない（stg環境の値をcontext経由で共用する。REQ-107・REQ-110）', () => {
    devTemplate.resourceCountIs('AWS::Cognito::UserPool', 0);
    devTemplate.resourceCountIs('AWS::Cognito::UserPoolClient', 0);
  });
});
