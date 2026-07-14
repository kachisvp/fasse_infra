import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { EnvironmentConfig } from './config';

export interface FasseInfraStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
}

export class FasseInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FasseInfraStackProps) {
    super(scope, id, props);

    const { resourcePrefix, envName, region } = props.config;
    const removalPolicy =
      envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    // 採番用カウンタテーブル（マスタのid、purchase_no/sales_noの連番管理）
    const countersTable = new dynamodb.Table(this, 'CountersTable', {
      tableName: `${resourcePrefix}-counters`,
      partitionKey: { name: 'counter_name', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });

    // マスタ（IDはcountersテーブルで採番する連番）
    const itemTable = new dynamodb.Table(this, 'ItemTable', {
      tableName: `${resourcePrefix}-m-item`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });

    const supplierTable = new dynamodb.Table(this, 'SupplierTable', {
      tableName: `${resourcePrefix}-m-supplier`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });

    const menuTable = new dynamodb.Table(this, 'MenuTable', {
      tableName: `${resourcePrefix}-m-menu`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });

    // 消費税率マスタ（tax_category + valid_fromの複合キーで期間管理する。連番採番は行わない）
    const taxRateTable = new dynamodb.Table(this, 'TaxRateTable', {
      tableName: `${resourcePrefix}-m-tax-rate`,
      partitionKey: { name: 'tax_category', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'valid_from', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });

    // 仕入（IDはUUID。detailはヘッダのidをPKに持つ）
    const purchaseHeaderTable = new dynamodb.Table(this, 'PurchaseHeaderTable', {
      tableName: `${resourcePrefix}-t-purchase-header`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });
    purchaseHeaderTable.addGlobalSecondaryIndex({
      indexName: 'gsi_purchase_date',
      partitionKey: { name: 'gsi_pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'purchase_date', type: dynamodb.AttributeType.STRING },
    });

    const purchaseDetailTable = new dynamodb.Table(this, 'PurchaseDetailTable', {
      tableName: `${resourcePrefix}-t-purchase-detail`,
      partitionKey: { name: 'purchase_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });

    // 売上（IDはUUID。detailはヘッダのidをPKに持つ）
    const salesHeaderTable = new dynamodb.Table(this, 'SalesHeaderTable', {
      tableName: `${resourcePrefix}-t-sales-header`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });
    salesHeaderTable.addGlobalSecondaryIndex({
      indexName: 'gsi_business_date',
      partitionKey: { name: 'gsi_pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'business_date', type: dynamodb.AttributeType.STRING },
    });

    const salesDetailTable = new dynamodb.Table(this, 'SalesDetailTable', {
      tableName: `${resourcePrefix}-t-sales-detail`,
      partitionKey: { name: 'sales_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });

    // --- Lambda + API Gateway ---
    // 第二弾よりJWT認証を導入する(docs/spec/authentication参照)。ルートA/ルートBのAPIエンドポイントには
    // NFR-005準拠のスロットリングを設定する(検証環境の通常利用を上回らない一般的な値)。
    const authThrottle = { throttlingRateLimit: 10, throttlingBurstLimit: 20 };
    const api = new apigateway.RestApi(this, 'Api', {
      restApiName: `${resourcePrefix}-api`,
      deployOptions: {
        stageName: envName,
        methodOptions: {
          '/auth/token/POST': authThrottle,
          '/auth/token/cognito/POST': authThrottle,
        },
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      },
    });

    // stg環境ではWAFを必須で併用する(NFR-004)。IP制限/Basic認証の具体的な方式は未定のため、
    // 当面はAWSマネージドルールのみを適用する(方式決定後に追加検討)。
    // dev環境は動作確認後にcdk destroyで速やかに破棄する運用のため対象外とする(REQ-109)。
    if (envName === 'stg') {
      const webAcl = new wafv2.CfnWebACL(this, 'ApiWebAcl', {
        scope: 'REGIONAL',
        defaultAction: { allow: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: `${resourcePrefix}-waf`,
          sampledRequestsEnabled: true,
        },
        rules: [
          {
            name: 'AWS-AWSManagedRulesCommonRuleSet',
            priority: 0,
            overrideAction: { none: {} },
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesCommonRuleSet',
              },
            },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: `${resourcePrefix}-waf-common`,
              sampledRequestsEnabled: true,
            },
          },
        ],
      });
      new wafv2.CfnWebACLAssociation(this, 'ApiWebAclAssociation', {
        resourceArn: `arn:aws:apigateway:${this.region}::/restapis/${api.restApiId}/stages/${api.deploymentStage.stageName}`,
        webAclArn: webAcl.attrArn,
      });
    }

    const commonFunctionProps: Partial<lambdaNodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      bundling: { minify: true },
    };

    // KMS公開鍵(PEM)・AccessKeyハッシュマップ・Cognito設定は、鍵作成やUser Pool作成等の手動セットアップ手順
    // (docs/spec/authentication task.md TASK-003/004/005/201〜204)完了後にCDK contextで設定する。
    // 未設定の間はWebAPI受口・ルートA/ルートBが401を返す(フェイルクローズ)。
    const jwtPublicKeyPem = (this.node.tryGetContext('jwtPublicKeyPem') as string | undefined) ?? '';
    const jwtIssuer = `${resourcePrefix}-auth`;

    // KMS非対称鍵はdev環境・stg環境で共用する単一のキーとする(REQ-108)。ここでは各環境のスタックが
    // 自環境用のキーリソースを作成する形にしており、実運用では同一ARNを両環境のLambdaに設定する
    // (TASK-001参照。鍵ARN自体をcontextで共有する運用に切り替えてもよい)。
    const jwtSigningKey = new kms.Key(this, 'JwtSigningKey', {
      keySpec: kms.KeySpec.RSA_2048,
      keyUsage: kms.KeyUsage.SIGN_VERIFY,
      removalPolicy,
    });
    // 初回デプロイ後、この値を使って公開鍵PEMをエクスポートする(TASK-003)
    new cdk.CfnOutput(this, 'JwtSigningKeyId', { value: jwtSigningKey.keyId });

    const authFunctionProps: Partial<lambdaNodejs.NodejsFunctionProps> = {
      ...commonFunctionProps,
      environment: {
        KMS_KEY_ID: jwtSigningKey.keyId,
        JWT_ISSUER: jwtIssuer,
      },
    };

    // ルートA(AccessKey): メンバーごとに個別発行したAccessKeyのSHA-256ハッシュ->メンバー識別子のマップ
    // (docs/spec/authentication REQ-102/TASK-005)。dev環境・stg環境で同一の値を設定する(REQ-108)。
    const accessKeyTokenFunction = new lambdaNodejs.NodejsFunction(this, 'AccessKeyTokenFunction', {
      ...authFunctionProps,
      entry: path.join(__dirname, 'lambda', 'auth', 'accessKeyToken.ts'),
      environment: {
        ...authFunctionProps.environment,
        ACCESS_KEY_HASH_MAP_JSON: (this.node.tryGetContext('accessKeyHashMapJson') as string | undefined) ?? '{}',
      },
    });
    jwtSigningKey.grant(accessKeyTokenFunction, 'kms:Sign');

    // Cognito User Pool・App Client・Hosted UIドメインはstg環境のスタックにのみ作成する。
    // dev環境は専用のPoolを作らず、stg環境の値をCDK context経由で共用する(REQ-107・REQ-110)。
    let cognitoUserPoolId = (this.node.tryGetContext('cognitoUserPoolId') as string | undefined) ?? '';
    let cognitoClientId = (this.node.tryGetContext('cognitoClientId') as string | undefined) ?? '';
    const cognitoRegion = (this.node.tryGetContext('cognitoRegion') as string | undefined) ?? region;

    if (envName === 'stg') {
      // セルフサインアップは無効。demo1/demo2のように事前登録したデモユーザーのみがログインできる
      // (社外の第三者が任意にアカウントを作成できないようにするため。REQ-110)
      const userPool = new cognito.UserPool(this, 'UserPool', {
        userPoolName: `${resourcePrefix}-user-pool`,
        selfSignUpEnabled: false,
        signInAliases: { email: true },
        removalPolicy,
      });

      // Hosted UIドメインはグローバルに一意である必要があるため、衝突した場合はcontextで変更する
      const cognitoDomainPrefix =
        (this.node.tryGetContext('cognitoDomainPrefix') as string | undefined) ?? `${resourcePrefix}-auth`;
      userPool.addDomain('UserPoolDomain', {
        cognitoDomain: { domainPrefix: cognitoDomainPrefix },
      });

      // fasse_front側がAuthorization Code Grant + PKCEで実装しているため、これに合わせる(REQ-110)。
      // コールバックURL/ログアウトURLはauth_callback.htmlに対応するURLをcontextで指定する
      const cognitoCallbackUrlsContext = this.node.tryGetContext('cognitoCallbackUrls') as string | undefined;
      const cognitoCallbackUrls = cognitoCallbackUrlsContext
        ? cognitoCallbackUrlsContext.split(',')
        : ['http://localhost:5000/auth_callback.html'];

      const userPoolClient = userPool.addClient('UserPoolClient', {
        generateSecret: false,
        oAuth: {
          flows: { authorizationCodeGrant: true },
          scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
          callbackUrls: cognitoCallbackUrls,
          logoutUrls: cognitoCallbackUrls,
        },
      });

      cognitoUserPoolId = userPool.userPoolId;
      cognitoClientId = userPoolClient.userPoolClientId;

      new cdk.CfnOutput(this, 'CognitoUserPoolId', { value: userPool.userPoolId });
      new cdk.CfnOutput(this, 'CognitoUserPoolClientId', { value: userPoolClient.userPoolClientId });
      new cdk.CfnOutput(this, 'CognitoHostedUiDomain', {
        value: `https://${cognitoDomainPrefix}.auth.${region}.amazoncognito.com`,
      });
    }

    // ルートB(Cognito ID Token): dev環境もstg環境のCognito User Poolを共用する(REQ-107)。
    // User Pool未構築の間は空文字となり、JWKS取得に失敗して401を返す(フェイルクローズ)。
    const cognitoTokenFunction = new lambdaNodejs.NodejsFunction(this, 'CognitoTokenFunction', {
      ...authFunctionProps,
      entry: path.join(__dirname, 'lambda', 'auth', 'cognitoToken.ts'),
      environment: {
        ...authFunctionProps.environment,
        COGNITO_USER_POOL_ID: cognitoUserPoolId,
        COGNITO_REGION: cognitoRegion,
        COGNITO_CLIENT_ID: cognitoClientId,
      },
    });
    jwtSigningKey.grant(cognitoTokenFunction, 'kms:Sign');

    // ルートA・ルートBはstg環境に常設し、dev環境も同一構成をミラーする(REQ-107)
    const authResource = api.root.addResource('auth');
    const tokenResource = authResource.addResource('token');
    tokenResource.addMethod('POST', new apigateway.LambdaIntegration(accessKeyTokenFunction));
    const cognitoTokenResource = tokenResource.addResource('cognito');
    cognitoTokenResource.addMethod('POST', new apigateway.LambdaIntegration(cognitoTokenFunction));

    function addCrudResource(
      resourceName: string,
      fn: lambdaNodejs.NodejsFunction,
    ): void {
      const integration = new apigateway.LambdaIntegration(fn);
      const collection = api.root.addResource(resourceName);
      collection.addMethod('GET', integration);
      collection.addMethod('POST', integration);
      const single = collection.addResource('{id}');
      single.addMethod('GET', integration);
      single.addMethod('PUT', integration);
      single.addMethod('DELETE', integration);
    }

    // マスタ: items / suppliers / menus
    const itemsFunction = new lambdaNodejs.NodejsFunction(this, 'ItemsFunction', {
      ...commonFunctionProps,
      entry: path.join(__dirname, 'lambda', 'items.ts'),
      environment: {
        JWT_PUBLIC_KEY_PEM: jwtPublicKeyPem,
        ITEM_TABLE: itemTable.tableName,
        COUNTERS_TABLE: countersTable.tableName,
      },
    });
    itemTable.grantReadWriteData(itemsFunction);
    countersTable.grantReadWriteData(itemsFunction);
    addCrudResource('items', itemsFunction);

    const suppliersFunction = new lambdaNodejs.NodejsFunction(this, 'SuppliersFunction', {
      ...commonFunctionProps,
      entry: path.join(__dirname, 'lambda', 'suppliers.ts'),
      environment: {
        JWT_PUBLIC_KEY_PEM: jwtPublicKeyPem,
        SUPPLIER_TABLE: supplierTable.tableName,
        COUNTERS_TABLE: countersTable.tableName,
      },
    });
    supplierTable.grantReadWriteData(suppliersFunction);
    countersTable.grantReadWriteData(suppliersFunction);
    addCrudResource('suppliers', suppliersFunction);

    const menusFunction = new lambdaNodejs.NodejsFunction(this, 'MenusFunction', {
      ...commonFunctionProps,
      entry: path.join(__dirname, 'lambda', 'menus.ts'),
      environment: {
        JWT_PUBLIC_KEY_PEM: jwtPublicKeyPem,
        MENU_TABLE: menuTable.tableName,
        COUNTERS_TABLE: countersTable.tableName,
      },
    });
    menuTable.grantReadWriteData(menusFunction);
    countersTable.grantReadWriteData(menusFunction);
    addCrudResource('menus', menusFunction);

    // 消費税率マスタ: tax-rates（tax_category + valid_fromの複合キーのため{id}方式ではなく専用ルーティングを行う。
    // t_purchase_detail/t_sales_detailからFK参照されず物理削除が可能なため、他マスタのcountersテーブルは使わない）
    const taxRatesFunction = new lambdaNodejs.NodejsFunction(this, 'TaxRatesFunction', {
      ...commonFunctionProps,
      entry: path.join(__dirname, 'lambda', 'taxRates.ts'),
      environment: {
        JWT_PUBLIC_KEY_PEM: jwtPublicKeyPem,
        TAX_RATE_TABLE: taxRateTable.tableName,
      },
    });
    taxRateTable.grantReadWriteData(taxRatesFunction);

    const taxRatesIntegration = new apigateway.LambdaIntegration(taxRatesFunction);
    const taxRatesCollection = api.root.addResource('tax-rates');
    taxRatesCollection.addMethod('GET', taxRatesIntegration);
    taxRatesCollection.addMethod('POST', taxRatesIntegration);
    const taxRateSingle = taxRatesCollection.addResource('{taxCategory}').addResource('{validFrom}');
    taxRateSingle.addMethod('GET', taxRatesIntegration);
    taxRateSingle.addMethod('PUT', taxRatesIntegration);
    taxRateSingle.addMethod('DELETE', taxRatesIntegration);

    // 仕入伝票: purchases（ヘッダ+明細）
    const purchasesFunction = new lambdaNodejs.NodejsFunction(this, 'PurchasesFunction', {
      ...commonFunctionProps,
      entry: path.join(__dirname, 'lambda', 'purchases.ts'),
      environment: {
        JWT_PUBLIC_KEY_PEM: jwtPublicKeyPem,
        PURCHASE_HEADER_TABLE: purchaseHeaderTable.tableName,
        PURCHASE_DETAIL_TABLE: purchaseDetailTable.tableName,
        COUNTERS_TABLE: countersTable.tableName,
      },
    });
    purchaseHeaderTable.grantReadWriteData(purchasesFunction);
    purchaseDetailTable.grantReadWriteData(purchasesFunction);
    countersTable.grantReadWriteData(purchasesFunction);
    addCrudResource('purchases', purchasesFunction);

    // 売上伝票: sales（ヘッダ+明細）
    const salesFunction = new lambdaNodejs.NodejsFunction(this, 'SalesFunction', {
      ...commonFunctionProps,
      entry: path.join(__dirname, 'lambda', 'sales.ts'),
      environment: {
        JWT_PUBLIC_KEY_PEM: jwtPublicKeyPem,
        SALES_HEADER_TABLE: salesHeaderTable.tableName,
        SALES_DETAIL_TABLE: salesDetailTable.tableName,
        COUNTERS_TABLE: countersTable.tableName,
      },
    });
    salesHeaderTable.grantReadWriteData(salesFunction);
    salesDetailTable.grantReadWriteData(salesFunction);
    countersTable.grantReadWriteData(salesFunction);
    addCrudResource('sales', salesFunction);
  }
}
