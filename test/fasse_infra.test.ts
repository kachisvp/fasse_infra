import * as cdk from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { FasseInfraStack } from '../lib/fasse_infra-stack';
import { FasseWebAclStack } from '../lib/fasse-web-acl-stack';

const DEV_JWT_SIGNING_KEY_ARN =
  'arn:aws:kms:ap-northeast-1:123456789012:key/11111111-2222-3333-4444-555555555555';

// IAMポリシーのうちKMSに関するステートメントを、アタッチ先のロールの論理IDとともに列挙する
function kmsStatements(template: Template): { actions: string[]; roles: string[] }[] {
  return Object.values(template.findResources('AWS::IAM::Policy')).flatMap((policy) => {
    const roles = ((policy.Properties.Roles ?? []) as { Ref: string }[]).map((r) => r.Ref);
    return (policy.Properties.PolicyDocument.Statement as { Action: string | string[] }[])
      .map((s) => ([] as string[]).concat(s.Action))
      .filter((actions) => actions.some((a) => a.startsWith('kms:')))
      .map((actions) => ({ actions, roles }));
  });
}

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

  test('Lambda関数が10個（items/suppliers/menus/tax-rates/purchases/sales/認証ルートA/ルートB + BucketDeploymentのカスタムリソース2個）作成される', () => {
    template.resourceCountIs('AWS::Lambda::Function', 10);
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

  test('KMS権限はJWT発行Lambda(ルートA・ルートB)のkms:Signのみで、WebAPI受口には付与しない（docs/specs/authentication design.md 3.2節）', () => {
    const statements = kmsStatements(template);
    expect(statements).toHaveLength(2);
    for (const { actions, roles } of statements) {
      expect(actions).toEqual(['kms:Sign']);
      expect(roles).toHaveLength(1);
      expect(roles[0]).toMatch(/^(AccessKeyTokenFunction|CognitoTokenFunction)ServiceRole/);
    }
  });

  test('stg環境のKMSキーの削除ポリシーはDESTROY（docs/specs/purchase-sales design.md「削除ポリシー」）', () => {
    template.hasResource('AWS::KMS::Key', { DeletionPolicy: 'Delete' });
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

  test('stg環境ではフロントエンド配信用のS3バケットがパブリックアクセスを完全ブロックして作成される（REQ-101/REQ-102）', () => {
    template.resourceCountIs('AWS::S3::Bucket', 1);
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'fasse-stg-test-web',
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('CloudFront DistributionがOAC経由でS3を参照し、HTTPSを強制する（REQ-201/REQ-202）', () => {
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultRootObject: 'index.html',
        DefaultCacheBehavior: {
          ViewerProtocolPolicy: 'redirect-to-https',
        },
      },
    });
  });

  test('CloudFrontがSPAルーティング用に403/404をindex.htmlの200へ読み替える（REQ-204）', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        CustomErrorResponses: [
          { ErrorCode: 403, ResponseCode: 200, ResponsePagePath: '/index.html' },
          { ErrorCode: 404, ResponseCode: 200, ResponsePagePath: '/index.html' },
        ],
      },
    });
  });

  test('BucketDeploymentがフロントエンド成果物をS3へ同期する', () => {
    template.resourceCountIs('Custom::CDKBucketDeployment', 1);
  });
});

describe('FasseInfraStack (dev環境)', () => {
  let devTemplate: Template;

  beforeAll(() => {
    const app = new cdk.App({ context: { jwtSigningKeyArn: DEV_JWT_SIGNING_KEY_ARN } });
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

  test('dev環境はKMSキーを作成せず、contextで渡されたstg環境のキーARNを使う（REQ-108）', () => {
    devTemplate.resourceCountIs('AWS::KMS::Key', 0);
    for (const functionName of ['AccessKeyTokenFunction', 'CognitoTokenFunction']) {
      const functions = devTemplate.findResources('AWS::Lambda::Function', {
        Properties: { Environment: { Variables: { KMS_KEY_ID: DEV_JWT_SIGNING_KEY_ARN } } },
      });
      expect(Object.keys(functions).some((id) => id.startsWith(functionName))).toBe(true);
    }
  });

  test('dev環境でもKMS権限はインポートしたキーへのkms:Signのみ', () => {
    const statements = kmsStatements(devTemplate);
    expect(statements).toHaveLength(2);
    devTemplate.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'kms:Sign', Resource: DEV_JWT_SIGNING_KEY_ARN }),
        ]),
      },
    });
  });

  test('dev環境でcontext jwtSigningKeyArnが未設定の場合は合成時エラー（REQ-108）', () => {
    const app = new cdk.App();
    expect(
      () =>
        new FasseInfraStack(app, 'TestDevStackWithoutKey', {
          env: { region: 'ap-northeast-1' },
          config: { envName: 'dev', region: 'ap-northeast-1', resourcePrefix: 'fasse-dev-test' },
        }),
    ).toThrow(/jwtSigningKeyArn/);
  });

  test('dev環境はcdk destroyでの破棄運用のためWAFを作成しない（REQ-109）', () => {
    devTemplate.resourceCountIs('AWS::WAFv2::WebACL', 0);
    devTemplate.resourceCountIs('AWS::WAFv2::WebACLAssociation', 0);
  });

  test('dev環境は専用のCognito User Poolを作成しない（stg環境の値をcontext経由で共用する。REQ-107・REQ-110）', () => {
    devTemplate.resourceCountIs('AWS::Cognito::UserPool', 0);
    devTemplate.resourceCountIs('AWS::Cognito::UserPoolClient', 0);
  });

  test('dev環境はフロントエンド配信用のS3バケット・CloudFrontを作成しない（docs/specs/web-hosting REQ-401）', () => {
    devTemplate.resourceCountIs('AWS::S3::Bucket', 0);
    devTemplate.resourceCountIs('AWS::CloudFront::Distribution', 0);
    devTemplate.resourceCountIs('Custom::CDKBucketDeployment', 0);
  });
});

describe('FasseWebAclStack', () => {
  test('CloudFront用WAFv2 WebACLがscope: CLOUDFRONTで、AWSマネージドルールのみを適用して作成される（REQ-301〜REQ-303）', () => {
    const app = new cdk.App();
    const stack = new FasseWebAclStack(app, 'TestWebAclStack', {
      env: { region: 'us-east-1' },
      config: {
        envName: 'stg',
        region: 'ap-northeast-1',
        resourcePrefix: 'fasse-stg-test',
      },
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::WAFv2::WebACL', 1);
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Scope: 'CLOUDFRONT',
      Rules: [
        {
          Name: 'AWS-AWSManagedRulesCommonRuleSet',
          Statement: {
            ManagedRuleGroupStatement: {
              VendorName: 'AWS',
              Name: 'AWSManagedRulesCommonRuleSet',
            },
          },
        },
      ],
    });
  });
});
