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

  test('DynamoDBテーブルが8個（counters, マスタ3, 仕入2, 売上2）作成される', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 8);
  });

  test('countersテーブルがcounter_nameをPKに持つ', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'fasse-stg-test-counters',
      KeySchema: [{ AttributeName: 'counter_name', KeyType: 'HASH' }],
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

  test('Lambda関数が5個（items/suppliers/menus/purchases/sales）作成される', () => {
    template.resourceCountIs('AWS::Lambda::Function', 5);
  });

  test('APIGatewayのRestApiが1個作成される', () => {
    template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
  });
});
